// API 設定
const API_URL = 'http://localhost:5000';
const socket = io(API_URL);

// DOM 元素
const ledSlider = document.getElementById('ledSlider');
const ledValue = document.getElementById('ledValue');
const ledBulb = document.getElementById('ledBulb');

const servoSlider = document.getElementById('servoSlider');
const servoValue = document.getElementById('servoValue');
const servoArm = document.getElementById('servoArm');

const voiceInput = document.getElementById('voiceCommand');
const sendButton = document.getElementById('sendCommand');
const responseBox = document.getElementById('llmResponse');
const responseText = document.getElementById('responseText');

const statusText = document.getElementById('statusText');
const connectionStatus = document.getElementById('connectionStatus');

// 狀態變數
let currentLedBrightness = 0;
let currentServoAngle = 0;

// ========== LED 控制 ==========
function updateLED(brightness) {
  currentLedBrightness = brightness;
  ledValue.textContent = brightness;
  ledSlider.value = brightness;

  // 更新 LED 視覺效果
  ledBulb.style.opacity = brightness / 100;
  if (brightness > 0) {
    ledBulb.classList.add('active');
  } else {
    ledBulb.classList.remove('active');
  }
}

function setLED(brightness) {
  fetch(`${API_URL}/api/led`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ brightness: brightness }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log('LED 設定成功:', data);
    })
    .catch((error) => {
      console.error('LED 控制錯誤:', error);
    });
}

ledSlider.addEventListener('input', (e) => {
  const brightness = parseInt(e.target.value);
  updateLED(brightness);
  setLED(brightness);
});

// LED 快速按鈕
document.querySelectorAll('[data-led]').forEach((button) => {
  button.addEventListener('click', () => {
    const brightness = parseInt(button.dataset.led);
    updateLED(brightness);
    setLED(brightness);
  });
});

// ========== 伺服馬達控制 ==========
function updateServo(angle) {
  currentServoAngle = angle;
  servoValue.textContent = angle;
  servoSlider.value = angle;

  // 更新伺服馬達視覺效果
  servoArm.style.transform = `translate(-50%, -100%) rotate(${angle}deg)`;
}

function setServo(angle) {
  fetch(`${API_URL}/api/servo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ angle: angle }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log('伺服馬達設定成功:', data);
    })
    .catch((error) => {
      console.error('伺服馬達控制錯誤:', error);
    });
}

servoSlider.addEventListener('input', (e) => {
  const angle = parseInt(e.target.value);
  updateServo(angle);
  setServo(angle);
});

// 伺服馬達快速按鈕
document.querySelectorAll('[data-servo]').forEach((button) => {
  button.addEventListener('click', () => {
    const angle = parseInt(button.dataset.servo);
    updateServo(angle);
    setServo(angle);
  });
});

// ========== 語音控制 ==========
async function sendVoiceCommand(command) {
  if (!command.trim()) return;

  sendButton.disabled = true;
  sendButton.textContent = '處理中...';
  sendButton.classList.add('processing');

  responseBox.style.display = 'block';
  responseText.textContent = '正在處理您的指令...';

  try {
    const response = await fetch(`${API_URL}/api/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command: command }),
    });

    const data = await response.json();
    responseText.textContent = data.response || '指令已執行';
  } catch (error) {
    console.error('語音指令錯誤:', error);
    responseText.textContent = '處理指令時發生錯誤，請稍後再試';
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = '發送';
    sendButton.classList.remove('processing');
  }
}

sendButton.addEventListener('click', () => {
  sendVoiceCommand(voiceInput.value);
});

voiceInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendVoiceCommand(voiceInput.value);
  }
});

// 快速指令按鈕
document.querySelectorAll('.quick-btn').forEach((button) => {
  button.addEventListener('click', () => {
    const command = button.dataset.command;
    voiceInput.value = command;
    sendVoiceCommand(command);
  });
});

// ========== WebSocket 連線 ==========
socket.on('connect', () => {
  console.log('WebSocket 已連線');
  statusText.textContent = '已連線';
  connectionStatus.classList.add('connected');
  connectionStatus.classList.remove('disconnected');
});

socket.on('disconnect', () => {
  console.log('WebSocket 已斷線');
  statusText.textContent = '已斷線';
  connectionStatus.classList.add('disconnected');
  connectionStatus.classList.remove('connected');
});

socket.on('state_update', (data) => {
  console.log('狀態更新:', data);
  updateLED(data.led_brightness);
  updateServo(data.servo_angle);
});

// ========== 初始化 ==========
async function initializeState() {
  try {
    const response = await fetch(`${API_URL}/api/state`);
    const data = await response.json();
    updateLED(data.led_brightness);
    updateServo(data.servo_angle);
    console.log('初始狀態載入完成');
  } catch (error) {
    console.error('無法載入初始狀態:', error);
    statusText.textContent = '後端未就緒';
    connectionStatus.classList.add('disconnected');
  }
}

// 頁面載入時初始化
window.addEventListener('load', initializeState);
