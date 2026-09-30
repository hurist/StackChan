> 该文档描述历史方案、历史快照或早期探索，不代表当前实现。
> 当前方向请参考 docs/README.md 和 docs/architecture.md。

# StackChan Home AI Robot Assistant Requirements

## 1. Project Goal

Build StackChan into a home AI robot assistant that can run continuously at home.

The robot should support both local voice interaction and remote messaging interaction. It should be able to help with home monitoring, remote chat, status queries, home appliance control, and basic visual understanding.

The target is not only a chatbot, and not only a camera. The target is a physical home assistant:

- At home: talk to the robot by voice, control home appliances, ask it to look at things.
- Away from home: use Telegram, QQ, or another messaging app to check status, request photos or videos, control appliances, and receive notifications.

## 2. Scope

In scope:

- Telegram, QQ, or other instant messaging integration.
- Remote chat.
- Robot status query.
- Scheduled and on-demand photo capture.
- Optional short video recording.
- Home appliance control.
- Basic visual question answering.
- Local AI Agent voice entry.
- Remote message entry.

Out of scope for the first stage:

- Fully self-hosted Xiaozhi server.
- Continuous visual memory.
- Complex home security detection.
- Multi-robot coordination.
- Complex permission management.
- Commercial admin backend.
- Direct code-agent integration such as Codex or Claude Code.

## 3. User Role

Primary user:

- The owner of the robot.

Typical scenarios:

- The user is at home and talks to StackChan by voice.
- The user is away and checks home status through Telegram or QQ.
- The user remotely asks the robot to take a photo, speak a message, or control a home appliance.
- The robot takes scheduled photos and pushes them to the user.

## 4. Main Interaction Entries

### 4.1 Local Voice Entry

The local voice entry is StackChan's AI Agent mode.

Example requests:

- Turn on the living room light.
- Look at what is on the desk.
- What is your battery level?
- Remind me to turn off the stove in 10 minutes.

The robot should understand the user's intent by voice and call the corresponding capability.

### 4.2 Remote Messaging Entry

The remote entry is Telegram, QQ, or another instant messaging platform.

Example requests:

- `/status`
- `/photo`
- Turn on the living room light.
- Check what is happening at home.
- `/say I will be home soon`

The system should return text, images, video files, or execution results through the messaging platform.

## 5. Functional Requirements

### 5.1 Instant Messaging Integration

The system should support at least one instant messaging platform in the first stage. Telegram is preferred because its Bot API is mature and simple to integrate.

Requirements:

- Receive messages from the user.
- Parse commands or natural language requests.
- Send text replies.
- Send images.
- Later support sending videos or files.
- Support proactive notifications from the robot or server.

Suggested initial commands:

- `/ping`
- `/status`
- `/photo`
- `/say <text>`
- `/light <room> on`
- `/light <room> off`
- `/ask <question>`

Example:

```text
User: /status
System: StackChan is online. Battery 82%. Charging. Wi-Fi normal. Last photo: 18:00.
```

### 5.2 Remote Chat

When the user is away from home, the user should be able to chat with the robot through Telegram, QQ, or another messaging app.

Requirements:

- Support ordinary text conversation.
- Support context-aware replies.
- Support robot status queries.
- Support home device status queries.
- Support sending a remote message for local robot display or speech.

Examples:

```text
User: Are you online at home?
Robot: I am online in the living room. Battery 78%. Network normal.

User: Tell the family I will arrive soon.
Robot: OK. I will show or speak that message at home.
```

### 5.3 Robot Status Query

The system should be able to query and return robot status.

Basic status:

- Online status.
- Battery level.
- Charging state.
- Network state.
- Current mode.
- Device name.
- Current time.
- Last photo time.
- Camera availability.

Optional status:

- Servo angles.
- LED state.
- Reminder list.
- Storage space.
- Firmware version.
- Temperature or other sensor state.

Example:

```text
Device: StackChan Living Room
Status: Online
Battery: 82%
Charging: Yes
Network: Normal
Mode: AI Agent
Last photo: 2026-08-24 18:00
```

### 5.4 Home Monitoring Photo Capture

The system should support taking photos with the robot camera and sending or storing them.

Trigger sources:

- Remote user command.
- Local voice request.
- Scheduled task.
- Event trigger.

Requirements:

- Take a photo.
- Save the image locally or on the server.
- Send the image through Telegram, QQ, or another messaging app.
- Record capture time.
- Return clear errors when capture fails.

Example:

```text
User: /photo
System: Taking a photo...
System: Sends current camera image.
```

Scheduled photo requirements:

- Support one or more fixed times every day.
- Support enabling or disabling scheduled capture.
- Support keeping the latest N images.
- Support optional automatic push to Telegram or QQ.

### 5.5 Short Video Recording

The system should later support short video recording.

Requirements:

- Support remote request for short video recording.
- Support configurable duration.
- Save the video locally or on the server.
- Send the video file or download link through Telegram, QQ, or another messaging app.

Example command:

```text
/video 10
```

This means recording a 10-second video.

The first stage may skip full video support and keep this as a later capability.

### 5.6 Home Appliance Control

The system should support controlling home appliances.

Control entries:

- Local AI Agent voice.
- Remote Telegram, QQ, or another messaging app.

Target devices:

- Lights.
- Air conditioners.
- TV.
- Smart plugs.
- Fans.
- Robot vacuum.
- Other smart home devices.

Possible integrations:

- Home Assistant.
- MQTT.
- Mi Home.
- Infrared control.
- LAN HTTP API.
- Custom service.

Basic capabilities:

- Turn device on.
- Turn device off.
- Query device status.
- Set device parameters.
- Execute scene modes.

Examples:

```text
User: Turn on the living room light.
System: Calls home.turn_on_light(room="living room").
Robot: Living room light is on.

User: /light living_room off
System: Living room light is off.
```

### 5.7 Basic Visual Ability

The system should support basic visual question answering based on a captured image.

Requirements:

- Capture a photo and analyze it.
- Describe the current scene.
- Recognize common objects.
- Read simple text in the image.
- Answer the user's question based on the image.

Typical questions:

- What is on the desk?
- What am I holding?
- Does anything look unusual at home?
- Read the text on this paper.
- Is the cat in the picture?

First-stage visual mode:

- On-demand photo capture.
- Single-image analysis.
- Text result returned to the user.

Not required in the first stage:

- Continuous video understanding.
- Long-term visual memory.
- Multi-object tracking.
- Complex behavior recognition.

### 5.8 AI Agent Tool Calling

In AI Agent mode, the robot should be able to call system capabilities through tools.

Callable capabilities:

- Robot motion.
- Robot LED effects.
- Reminders.
- Photo capture.
- Visual question answering.
- Home appliance control.
- Status query.

Examples:

```text
User: Look at what is in front of you.
Robot: Calls a visual tool, captures a photo, analyzes it, and answers.

User: Turn on the living room light.
Robot: Calls the home appliance control tool and answers.

User: What is your battery level?
Robot: Queries status and answers.
```

### 5.9 Remote Message Broadcast

The user should be able to send text remotely and ask the robot to display or speak it at home.

Requirements:

- Receive text from Telegram, QQ, or another messaging app.
- Display the text locally on the robot.
- Optionally use TTS to speak the text.
- Optionally show mouth animation while speaking.
- Return execution result to the user.

Example:

```text
User: /say I will be home in 10 minutes.
Robot at home: Speaks or displays "I will be home in 10 minutes."
Telegram: Message delivered.
```

### 5.10 Proactive Notifications

The system should support proactive notifications to the user.

Possible triggers:

- Scheduled photo completed.
- Device offline.
- Device online again.
- Low battery.
- Home appliance control failed.
- Visual abnormality detected.
- Reminder triggered.

Examples:

```text
System: StackChan battery is below 20%.
System: Scheduled 18:00 photo has been captured.
```

## 6. Non-Functional Requirements

### 6.1 Stability

The system should support long-running home usage.

Requirements:

- Automatically reconnect after network loss.
- Recover device connection after server restart.
- Recover Telegram or QQ bot after errors.
- Photo failure should not break other capabilities.
- Home appliance control failure should return a clear error.

### 6.2 Security

The system controls cameras and home appliances, so security is required.

Requirements:

- Only authorized users can control the robot.
- Telegram or QQ user ID allowlist.
- Permission checks for sensitive commands.
- Do not store model API keys in firmware.
- Do not store home appliance account credentials in firmware.
- Remote control APIs must be authenticated.
- Logs must avoid sensitive tokens.

High-risk capabilities should require extra care:

- Door locks.
- Security system disablement.
- Arbitrary shell execution.
- Remote code modification.
- Long-running camera live stream.

### 6.3 Privacy

The system involves home images and videos.

Requirements:

- Photo or video capture should have a clear trigger source.
- Image storage location should be controllable.
- Scheduled photo capture should be easy to disable.
- Historical images should be deletable.
- Images should not be publicly uploaded by default.
- Calls to external visual models should be known to the user.

### 6.4 Extensibility

Capabilities should be unified so each entry does not need its own implementation.

Suggested capability interface:

- `robot.get_status()`
- `robot.say(text)`
- `robot.take_photo()`
- `robot.record_video(duration)`
- `robot.look_at_scene(question)`
- `home.turn_on_light(room)`
- `home.turn_off_light(room)`
- `home.get_status()`

These capabilities should be reusable by:

- AI Agent voice entry.
- Telegram or QQ entry.
- Mobile app entry.
- Scheduled tasks.

## 7. Recommended Priority

### P0: Basic Remote Loop

Goal: prove that the whole system can work end to end.

Requirements:

- Telegram bot integration.
- `/status` returns robot online status.
- `/photo` captures a photo and sends it to Telegram.
- `/say` displays or speaks a message through the robot.

### P1: Home Appliance Control

Goal: make the robot useful in the home environment.

Requirements:

- Integrate one home appliance platform.
- Support turning a light on and off.
- Support querying appliance status.
- Support Telegram control.
- Support AI Agent voice control.

### P2: Visual Question Answering

Goal: give the robot basic "look once and answer" ability.

Requirements:

- Capture photo and send it to a visual model.
- Return scene description.
- Support Telegram image question.
- Support AI Agent voice-triggered visual tool.

### P3: Scheduled Monitoring

Goal: form a lightweight home monitoring workflow.

Requirements:

- Scheduled daily photo capture.
- Save historical images.
- Optional Telegram push.
- Query latest photo.

### P4: Remote Natural Chat

Goal: make Telegram or QQ more than a command interface.

Requirements:

- Natural language understanding for remote messages.
- Reply using robot status and home status.
- Maintain remote chat context.

### P5: Video and Advanced Vision

Goal: enhance monitoring and visual intelligence.

Requirements:

- Short video recording.
- Video sending.
- Abnormality detection.
- Visual memory.
- Multi-turn visual question answering.

## 8. MVP Definition

The first MVP should include only:

- Telegram bot.
- Robot online status query.
- Remote photo capture and Telegram delivery.
- Remote text message display or speech through the robot.
- One simple home appliance control, such as turning the living room light on and off.

MVP should not include:

- QQ.
- Complex natural language.
- Continuous video.
- Full visual memory.
- Self-hosted Xiaozhi server.
- Codex or Claude Code integration.

MVP success criteria:

- The user can confirm the robot is online through Telegram.
- The user can get a current photo through Telegram.
- The user can control one light through Telegram.
- The user can ask the robot to display or speak one remote message.
- The user can control the same light by voice in AI Agent mode.

## 9. Summary

The goal is to extend StackChan into a home AI robot assistant with both local voice and remote messaging entries.

It should support status query, photo monitoring, message broadcast, home appliance control, and basic visual question answering.

The system should use a shared capability layer so AI Agent voice, Telegram or QQ messages, mobile app actions, and scheduled tasks can call the same robot and home control capabilities.
