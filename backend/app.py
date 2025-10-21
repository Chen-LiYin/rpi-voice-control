from flask import Flask, request, jsonify
from flask_cors import CORS
from gpiozero import LED, Servo
from gpiozero.pins.pigpio import PiGPIOFactory
import subprocess
import requests
import json
import re
import threading

app = Flask(__name__)
CORS(app)

# GPIO 設置使用 pigpio
factory = PiGPIOFactory()
led = LED(18, pin_factory=factory)
servo = Servo(12, pin_factory=factory)

# 狀態管理
current_state = {
    'led_brightness': 0,
    'servo_angle': 0
}

def set_led_brightness(brightness):
    """設定 LED 亮度（0-100）"""
    brightness = max(0, min(100, brightness))
    led.value = brightness / 100.0
    current_state['led_brightness'] = brightness
    return brightness

def set_servo_angle(angle):
    """設定伺服馬達角度（-90 到 90）"""
    angle = max(-90, min(90, angle))
    servo.value = angle / 90.0
    current_state['servo_angle'] = angle
    return angle

def text_to_speech(text):
    """使用 espeak 將文字轉換為語音（背景執行）"""
    def speak():
        try:
            subprocess.run(['espeak', text], check=True, 
                         stdout=subprocess.DEVNULL, 
                         stderr=subprocess.DEVNULL)
        except Exception as e:
            print(f"TTS 錯誤：{e}")
    
    # 在背景執行，不阻塞主程序
    thread = threading.Thread(target=speak)
    thread.daemon = True
    thread.start()

def parse_command_with_ollama(user_input):
    """使用 Ollama API 解析指令"""
    try:
        response = requests.post('http://localhost:11434/api/generate', 
            json={
                'model': 'tinyllama',
                'prompt': f'''Parse this smart home command and respond with JSON only:
Command: "{user_input}"

Response format:
{{"action": "set_led" or "set_servo" or "set_both" or "unknown", "led_brightness": 0-100 or null, "servo_angle": -90 to 90 or null, "response": "confirmation message"}}

Examples:
"turn on the light" -> {{"action": "set_led", "led_brightness": 100, "servo_angle": null, "response": "Turning LED on"}}
"brightness 50" -> {{"action": "set_led", "led_brightness": 50, "servo_angle": null, "response": "Setting brightness to 50%"}}
"servo center" -> {{"action": "set_servo", "led_brightness": null, "servo_angle": 0, "response": "Moving servo to center"}}

JSON only:''',
                'stream': False
            },
            timeout=10
        )
        
        if response.status_code == 200:
            result_text = response.json()['response']
            json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
    except Exception as e:
        print(f"Ollama 錯誤：{e}")
    
    # 如果 Ollama 失敗，使用規則引擎
    return parse_command_with_rules(user_input)

def parse_command_with_rules(user_input):
    """簡單的規則引擎解析指令（備用方案）"""
    user_input = user_input.lower()
    
    # LED 控制
    if 'light' in user_input or 'led' in user_input or 'brightness' in user_input:
        if 'off' in user_input or 'turn off' in user_input:
            return {
                "action": "set_led",
                "led_brightness": 0,
                "servo_angle": None,
                "response": "Turning LED off"
            }
        elif 'on' in user_input or 'turn on' in user_input:
            return {
                "action": "set_led",
                "led_brightness": 100,
                "servo_angle": None,
                "response": "Turning LED on"
            }
        elif 'dim' in user_input:
            return {
                "action": "set_led",
                "led_brightness": 30,
                "servo_angle": None,
                "response": "Dimming LED to 30%"
            }
        else:
            # 尋找數字
            numbers = re.findall(r'\d+', user_input)
            if numbers:
                brightness = int(numbers[0])
                brightness = max(0, min(100, brightness))
                return {
                    "action": "set_led",
                    "led_brightness": brightness,
                    "servo_angle": None,
                    "response": f"Setting LED brightness to {brightness}%"
                }
    
    # 伺服馬達控制
    if 'servo' in user_input or 'rotate' in user_input or 'move' in user_input:
        if 'left' in user_input:
            return {
                "action": "set_servo",
                "led_brightness": None,
                "servo_angle": -45,
                "response": "Moving servo left"
            }
        elif 'right' in user_input:
            return {
                "action": "set_servo",
                "led_brightness": None,
                "servo_angle": 45,
                "response": "Moving servo right"
            }
        elif 'center' in user_input or 'middle' in user_input:
            return {
                "action": "set_servo",
                "led_brightness": None,
                "servo_angle": 0,
                "response": "Moving servo to center"
            }
        else:
            # 尋找角度
            numbers = re.findall(r'-?\d+', user_input)
            if numbers:
                angle = int(numbers[0])
                angle = max(-90, min(90, angle))
                return {
                    "action": "set_servo",
                    "led_brightness": None,
                    "servo_angle": angle,
                    "response": f"Rotating servo to {angle} degrees"
                }
    
    # 組合指令
    if ('light' in user_input or 'led' in user_input) and ('servo' in user_input or 'rotate' in user_input):
        return {
            "action": "set_both",
            "led_brightness": 50,
            "servo_angle": 0,
            "response": "Setting LED to 50% and centering servo"
        }
    
    return {
        "action": "unknown",
        "led_brightness": None,
        "servo_angle": None,
        "response": "I didn't understand that command. Try 'turn on the light' or 'move servo left'"
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
    
    # 嘗試使用 Ollama，如果失敗則使用規則引擎
    try:
        result = parse_command_with_ollama(user_input)
    except:
        result = parse_command_with_rules(user_input)
    
    # 執行動作
    if result['led_brightness'] is not None:
        set_led_brightness(result['led_brightness'])
    
    if result['servo_angle'] is not None:
        set_servo_angle(result['servo_angle'])
    
    # 語音回應（背景執行，不阻塞）
    text_to_speech(result['response'])
    
    return jsonify(result)

@app.route('/api/state', methods=['GET'])
def get_state():
    return jsonify(current_state)

# 清理
@app.route('/api/shutdown', methods=['POST'])
def shutdown():
    led.off()
    servo.mid()
    return jsonify({'status': 'shutdown'})

if __name__ == '__main__':
    try:
        print("=" * 50)
        print("啟動智慧家居控制器...")
        print(f"LED：GPIO 18")
        print(f"伺服馬達：GPIO 12")
        print("規則引擎已就緒（Ollama 可選）")
        print("=" * 50)
        app.run(host='0.0.0.0', port=5000, debug=True)
    except KeyboardInterrupt:
        print("\n正在關閉...")
        led.close()
        servo.close()