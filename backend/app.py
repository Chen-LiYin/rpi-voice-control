from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from gpiozero import LED, Servo
from gpiozero.pins.pigpio import PiGPIOFactory
import ollama
import subprocess
import os
import json
import re

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# GPIO 設置使用 pigpio
factory = PiGPIOFactory()
led = LED(18, pin_factory=factory)
servo = Servo(12, pin_factory=factory)

# 狀態管理
current_state = {
    'led_brightness': 0,
    'servo_angle': 0
}

# TTS 設定
PIPER_PATH = os.path.expanduser('~/rpi-voice-control/backend/tts_models/piper/piper')
VOICE_MODEL = os.path.expanduser('~/rpi-voice-control/backend/tts_models/en_US-lessac-medium.onnx')

def set_led_brightness(brightness):
    """設定 LED 亮度（0-100）"""
    brightness = max(0, min(100, brightness))
    led.value = brightness / 100.0
    current_state['led_brightness'] = brightness
    socketio.emit('state_update', current_state)
    return brightness

def set_servo_angle(angle):
    """設定伺服馬達角度（-90 到 90）"""
    angle = max(-90, min(90, angle))
    servo.value = angle / 90.0
    current_state['servo_angle'] = angle
    socketio.emit('state_update', current_state)
    return angle

def text_to_speech(text):
    """使用 Piper 將文字轉換為語音"""
    try:
        output_file = '/tmp/tts_output.wav'
        process = subprocess.Popen(
            [PIPER_PATH, '--model', VOICE_MODEL, '--output_file', output_file],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        process.communicate(input=text.encode('utf-8'))
        
        # 播放音訊
        subprocess.run(['aplay', output_file], check=True)
        return True
    except Exception as e:
        print(f"TTS 錯誤：{e}")
        return False

def parse_llm_command(user_input):
    """使用 LLM 解析自然語言指令"""
    prompt = f"""你是一個智慧家居控制器。解析此指令並僅以有效的 JSON 回應。

指令：「{user_input}」

以此精確格式回應 JSON：
{{
    "action": "set_led" 或 "set_servo" 或 "set_both" 或 "unknown",
    "led_brightness": 0-100 或 null,
    "servo_angle": -90 到 90 或 null,
    "response": "友善的確認訊息"
}}

範例：
- "turn on the light" → {{"action": "set_led", "led_brightness": 100, "servo_angle": null, "response": "正在開啟 LED"}}
- "set brightness to 50%" → {{"action": "set_led", "led_brightness": 50, "servo_angle": null, "response": "將 LED 亮度設定為 50%"}}
- "rotate servo to 45 degrees" → {{"action": "set_servo", "led_brightness": null, "servo_angle": 45, "response": "將伺服馬達旋轉到 45 度"}}
- "dim the light and move servo left" → {{"action": "set_both", "led_brightness": 30, "servo_angle": -45, "response": "調暗燈光並將伺服馬達向左移動"}}

僅 JSON，無需解釋："""

    try:
        response = ollama.chat(model='phi:2.7b', messages=[
            {'role': 'user', 'content': prompt}
        ])
        
        response_text = response['message']['content'].strip()
        
        # 從回應中提取 JSON（處理 markdown 程式碼區塊）
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            return result
        else:
            return {
                "action": "unknown",
                "led_brightness": None,
                "servo_angle": None,
                "response": "我不理解該指令。"
            }
    except Exception as e:
        print(f"LLM 錯誤：{e}")
        return {
            "action": "unknown",
            "led_brightness": None,
            "servo_angle": None,
            "response": "抱歉，我無法處理。"
        }

# REST API 端點
@app.route('/api/led', methods=['POST'])
def control_led():
    data = request.json
    brightness = data.get('brightness', 0)
    actual_brightness = set_led_brightness(brightness)
    return jsonify({'brightness': actual_brightness})

@app.route('/api/servo', methods=['POST'])
def control_servo():
    data = request.json
    angle = data.get('angle', 0)
    actual_angle = set_servo_angle(angle)
    return jsonify({'angle': actual_angle})

@app.route('/api/voice', methods=['POST'])
def voice_command():
    data = request.json
    user_input = data.get('command', '')
    
    # 使用 LLM 解析指令
    result = parse_llm_command(user_input)
    
    # 執行動作
    if result['led_brightness'] is not None:
        set_led_brightness(result['led_brightness'])
    
    if result['servo_angle'] is not None:
        set_servo_angle(result['servo_angle'])
    
    # 語音回應
    text_to_speech(result['response'])
    
    return jsonify(result)

@app.route('/api/state', methods=['GET'])
def get_state():
    return jsonify(current_state)

# WebSocket 事件
@socketio.on('connect')
def handle_connect():
    emit('state_update', current_state)

@socketio.on('led_control')
def handle_led(data):
    brightness = data.get('brightness', 0)
    set_led_brightness(brightness)

@socketio.on('servo_control')
def handle_servo(data):
    angle = data.get('angle', 0)
    set_servo_angle(angle)

# 清理
@app.route('/api/shutdown', methods=['POST'])
def shutdown():
    led.off()
    servo.mid()
    return jsonify({'status': 'shutdown'})

if __name__ == '__main__':
    try:
        print("啟動智慧家居控制器...")
        print(f"LED：GPIO 18，伺服馬達：GPIO 12")
        socketio.run(app, host='0.0.0.0', port=5000, debug=True)
    except KeyboardInterrupt:
        led.close()
        servo.close()