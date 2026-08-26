/*
 * SPDX-FileCopyrightText: 2026 M5Stack Technology CO LTD
 *
 * SPDX-License-Identifier: MIT
 */
#include "hal.h"
#include "board/hal_bridge.h"
#include <apps/common/toast/toast.h>
#include <ArduinoJson.hpp>
#include <board.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <mooncake_log.h>
#include <sdkconfig.h>
#include <stackchan/stackchan.h>
#include <web_socket.h>
#include <wifi_manager.h>
#include <array>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <vector>

static const std::string_view _tag = "HomeRemote";

namespace {

struct ReceivedMessage {
    bool binary = false;
    std::vector<uint8_t> data;
};

struct CommandResult {
    std::string command_id;
    bool ok = false;
    std::string message;
    std::string error;
    bool include_status_data = false;
};

std::string get_home_server_url()
{
#ifdef CONFIG_HOME_SERVER_URL
    return CONFIG_HOME_SERVER_URL;
#else
    return "";
#endif
}

std::string get_home_server_shared_secret()
{
#ifdef CONFIG_HOME_SERVER_SHARED_SECRET
    return CONFIG_HOME_SERVER_SHARED_SECRET;
#else
    return "";
#endif
}

std::string trim_trailing_slash(std::string value)
{
    while (!value.empty() && value.back() == '/') {
        value.pop_back();
    }
    return value;
}

std::string make_home_remote_ws_url()
{
    std::string base_url = trim_trailing_slash(get_home_server_url());
    if (base_url.rfind("https://", 0) == 0) {
        base_url.replace(0, 8, "wss://");
    } else if (base_url.rfind("http://", 0) == 0) {
        base_url.replace(0, 7, "ws://");
    }
    return base_url + "/robot/ws";
}

bool is_wifi_connected()
{
    auto& wifi = WifiManager::GetInstance();
    return wifi.IsInitialized() && wifi.IsConnected() && !wifi.IsConfigMode();
}

std::string wifi_status_to_string(WifiStatus status)
{
    switch (status) {
        case WifiStatus::High:
            return "high";
        case WifiStatus::Medium:
            return "medium";
        case WifiStatus::Low:
            return "low";
        case WifiStatus::None:
        default:
            return "none";
    }
}

void write_status_data(ArduinoJson::JsonObject data)
{
    data["device_id"]        = GetHAL().getFactoryMacString();
    data["firmware_version"] = FIRMWARE_VERSION;
    data["battery_level"]    = GetHAL().getBatteryLevel();
    data["charging"]         = GetHAL().isBatteryCharging();
    data["wifi"]             = wifi_status_to_string(GetHAL().getWifiStatus());
    data["mode"]             = hal_bridge::is_xiaozhi_mode() ? "xiaozhi" : "mooncake";
}

class RecentCommandCache {
public:
    bool find(std::string_view command_id, CommandResult& result) const
    {
        for (const auto& item : _items) {
            if (item.command_id == command_id) {
                result = item;
                return true;
            }
        }
        return false;
    }

    void remember(const CommandResult& result)
    {
        _items[_next_index] = result;
        _next_index++;
        if (_next_index >= _items.size()) {
            _next_index = 0;
        }
    }

private:
    std::array<CommandResult, 16> _items;
    size_t _next_index = 0;
};

class HomeRemoteWsClient {
public:
    void run()
    {
        _url = make_home_remote_ws_url();
        if (_url.empty() || _url == "/robot/ws") {
            mclog::tagError(_tag, "Home Server URL is not configured");
            return;
        }

        while (true) {
            ensureNetworkStarted();
            update();
            vTaskDelay(pdMS_TO_TICKS(200));
        }
    }

private:
    std::unique_ptr<WebSocket> _websocket;
    std::string _url;
    std::mutex _mutex;
    std::mutex _send_mutex;
    std::queue<ReceivedMessage> _msg_queue;
    RecentCommandCache _recent_commands;
    uint32_t _last_reconnect_attempt = 0;
    uint32_t _last_ping_tick         = 0;
    bool _network_started            = false;

    void ensureNetworkStarted()
    {
        if (_network_started) {
            return;
        }
        _network_started = true;

        // Start the underlying network stack without occupying Board::SetNetworkEventCallback()
        // and without blocking boot. HomeRemote owns only its WebSocket retry state.
        Board::GetInstance().StartNetwork();
    }

    void update()
    {
        if (!is_wifi_connected()) {
            return;
        }

        if (!_websocket || !_websocket->IsConnected()) {
            if (GetHAL().millis() - _last_reconnect_attempt > 5000) {
                connect();
            }
            return;
        }

        processMessages();
        sendHeartbeatIfNeeded();
    }

    void connect()
    {
        _last_reconnect_attempt = GetHAL().millis();
        _websocket.reset();

        auto network = Board::GetInstance().GetNetwork();
        if (!network) {
            mclog::tagError(_tag, "network interface is not available");
            return;
        }
        _websocket   = network->CreateWebSocket(1);
        if (!_websocket) {
            mclog::tagError(_tag, "failed to create websocket");
            return;
        }

        auto secret = get_home_server_shared_secret();
        if (!secret.empty()) {
            std::string auth_header = "Bearer " + secret;
            _websocket->SetHeader("Authorization", auth_header.c_str());
        }

        _websocket->OnConnected([this]() {
            mclog::tagInfo(_tag, "connected to {}", _url);
            sendHello();
        });

        _websocket->OnDisconnected([this]() {
            mclog::tagInfo(_tag, "disconnected");
        });

        _websocket->OnData([this](const char* data, size_t len, bool binary) {
            std::lock_guard<std::mutex> lock(_mutex);
            _msg_queue.push({binary, std::vector<uint8_t>(data, data + len)});
        });

        if (!_websocket->Connect(_url.c_str())) {
            mclog::tagError(_tag, "failed to connect {}", _url);
        }
    }

    void sendHello()
    {
        ArduinoJson::JsonDocument doc;
        doc["type"]             = "hello";
        doc["device_id"]        = GetHAL().getFactoryMacString();
        doc["client_id"]        = Board::GetInstance().GetUuid();
        doc["firmware_version"] = FIRMWARE_VERSION;
        auto capabilities       = doc["capabilities"].to<ArduinoJson::JsonArray>();
        capabilities.add("status");
        capabilities.add("notify");
        capabilities.add("set_led_color");
        sendJson(doc);
    }

    void sendHeartbeatIfNeeded()
    {
        uint32_t now = GetHAL().millis();
        if (now - _last_ping_tick < 10000) {
            return;
        }
        _last_ping_tick = now;

        ArduinoJson::JsonDocument doc;
        doc["type"] = "pong";
        sendJson(doc);
    }

    void processMessages()
    {
        std::vector<ReceivedMessage> messages;
        {
            std::lock_guard<std::mutex> lock(_mutex);
            while (!_msg_queue.empty()) {
                messages.push_back(std::move(_msg_queue.front()));
                _msg_queue.pop();
            }
        }

        for (const auto& msg : messages) {
            handleMessage(msg);
        }
    }

    void handleMessage(const ReceivedMessage& msg)
    {
        if (msg.binary) {
            mclog::tagError(_tag, "ignored binary message");
            return;
        }

        std::string text(msg.data.begin(), msg.data.end());
        ArduinoJson::JsonDocument doc;
        auto error = ArduinoJson::deserializeJson(doc, text);
        if (error) {
            mclog::tagError(_tag, "deserializeJson failed: {}", error.c_str());
            return;
        }

        std::string type = doc["type"].is<std::string>() ? doc["type"].as<std::string>() : "";
        if (type == "hello_ack") {
            mclog::tagInfo(_tag, "hello ack");
            return;
        }
        if (type != "command") {
            return;
        }

        handleCommand(doc);
    }

    void handleCommand(ArduinoJson::JsonDocument& doc)
    {
        std::string command_id = doc["command_id"].is<std::string>() ? doc["command_id"].as<std::string>() : "";
        std::string name       = doc["name"].is<std::string>() ? doc["name"].as<std::string>() : "";
        if (command_id.empty() || name.empty()) {
            sendResult({"", false, "missing command_id or name", "invalid_argument", false});
            return;
        }

        CommandResult cached;
        if (_recent_commands.find(command_id, cached)) {
            sendResult(cached);
            return;
        }

        CommandResult result = executeCommand(command_id, name, doc["payload"].as<ArduinoJson::JsonObject>());
        _recent_commands.remember(result);
        sendResult(result);
    }

    CommandResult executeCommand(const std::string& command_id, const std::string& name, ArduinoJson::JsonObject payload)
    {
        if (name == "status") {
            return {command_id, true, "ok", "", true};
        }

        if (name == "notify") {
            if (!payload["text"].is<std::string>() || payload["text"].as<std::string>().empty()) {
                return {command_id, false, "text is required", "invalid_argument", false};
            }

            std::string text = payload["text"].as<std::string>();
            if (text.size() > 160) {
                return {command_id, false, "text is too long", "invalid_argument", false};
            }

            mclog::tagInfo(_tag, "remote notify: {}", text);
            if (!hal_bridge::is_xiaozhi_mode()) {
                view::pop_a_toast(text, view::ToastType::Info, 3000);
                return {command_id, true, "displayed", "", false};
            }

            return {command_id, true, "received", "", false};
        }

        if (name == "set_led_color") {
            if (!payload["red"].is<int>() || !payload["green"].is<int>() || !payload["blue"].is<int>()) {
                return {command_id, false, "red/green/blue are required", "invalid_argument", false};
            }
            int red   = payload["red"].as<int>();
            int green = payload["green"].as<int>();
            int blue  = payload["blue"].as<int>();
            if (!isSafeColor(red) || !isSafeColor(green) || !isSafeColor(blue)) {
                return {command_id, false, "red/green/blue must be 0-168", "invalid_argument", false};
            }

            // The first HomeRemote LED command is intentionally temporary: no NVS writes,
            // and mode-specific status effects may overwrite it on the next normal refresh.
            LvglLockGuard lock;
            GetStackChan().leftNeonLight().setColor(red, green, blue);
            GetStackChan().rightNeonLight().setColor(red, green, blue);
            return {command_id, true, "led updated", "", false};
        }

        return {command_id, false, "unsupported command", "unsupported", false};
    }

    bool isSafeColor(int value)
    {
        return value >= 0 && value <= 168;
    }

    void sendResult(const CommandResult& result)
    {
        ArduinoJson::JsonDocument doc;
        doc["type"]       = "command_result";
        doc["command_id"] = result.command_id;
        doc["ok"]         = result.ok;
        if (!result.message.empty()) {
            doc["message"] = result.message;
        }
        if (!result.error.empty()) {
            doc["error"] = result.error;
        }
        if (result.include_status_data) {
            write_status_data(doc["data"].to<ArduinoJson::JsonObject>());
        }
        sendJson(doc);
    }

    void sendJson(const ArduinoJson::JsonDocument& doc)
    {
        std::lock_guard<std::mutex> lock(_send_mutex);
        if (!_websocket || !_websocket->IsConnected()) {
            return;
        }

        std::string output;
        ArduinoJson::serializeJson(doc, output);
        _websocket->Send(output);
    }
};

void home_remote_task(void* param)
{
    auto client = std::make_unique<HomeRemoteWsClient>();
    client->run();
    vTaskDelete(nullptr);
}

}  // namespace

void Hal::startHomeRemoteService()
{
    mclog::tagInfo(_tag, "start home remote service");
    xTaskCreatePinnedToCore(home_remote_task, "home_remote", 6144, nullptr, 3, nullptr, 1);
}
