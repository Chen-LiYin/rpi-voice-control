// API 設定
const API_URL = 'http://localhost:5000';

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

const micButton = document.getElementById('micButton');
const listeningIndicator = document.getElementById('listeningIndicator');

const statusText = document.getElementById('statusText');
const connectionStatus = document.getElementById('connectionStatus');

// 狀態變數
let currentLedBrightness = 0;
let currentServoAngle = 0;

// ========== 語音辨識設置 ==========
let recognition = null;
let isListening = false;

// 檢查瀏覽器是否支援語音辨識
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US'; // 英文辨識

  recognition.onstart = () => {
    isListening = true;
    micButton.classList.add('listening');
    listeningIndicator.classList.add('active');
    console.log('開始語音辨識...');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log('辨識結果:', transcript);
    voiceInput.value = transcript;
    sendVoiceCommand(transcript);
  };

  recognition.onerror = (event) => {
    console.error('語音辨識錯誤:', event.error);
    isListening = false;
    micButton.classList.remove('listening');
    listeningIndicator.classList.remove('active');

    if (event.error === 'no-speech') {
      alert('沒有偵測到語音，請再試一次');
    } else if (event.error === 'not-allowed') {
      alert('請允許使用麥克風權限');
    }
  };

  recognition.onend = () => {
    isListening = false;
    micButton.classList.remove('listening');
    listeningIndicator.classList.remove('active');
    console.log('語音辨識結束');
  };
} else {
  // 瀏覽器不支援語音辨識
  const voiceControl = document.querySelector('.voice-control');
  const warning = document.createElement('div');
  warning.className = 'not-supported';
  warning.innerHTML =
    '⚠️ 您的瀏覽器不支援語音辨識功能，請使用 Chrome 或 Edge 瀏覽器';
  voiceControl.insertBefore(warning, voiceControl.firstChild);
  micButton.disabled = true;
  micButton.style.opacity = '0.5';
}

// 麥克風按鈕事件
micButton.addEventListener('mousedown', () => {
  if (recognition && !isListening) {
    recognition.start();
  }
});

micButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (recognition && !isListening) {
    recognition.start();
  }
});

// 也可以點擊切換
micButton.addEventListener('click', (e) => {
  e.preventDefault();
  if (recognition) {
    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  }
});

// ========== LED 控制 ==========
function updateLED(brightness) {
  currentLedBrightness = brightness;
  ledValue.textContent = brightness;
  ledSlider.value = brightness;

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

    if (data.led_brightness !== null) {
      updateLED(data.led_brightness);
    }
    if (data.servo_angle !== null) {
      updateServo(data.servo_angle);
    }
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

document.querySelectorAll('.quick-btn').forEach((button) => {
  button.addEventListener('click', () => {
    const command = button.dataset.command;
    voiceInput.value = command;
    sendVoiceCommand(command);
  });
});

// ========== 初始化 ==========
async function initializeState() {
  try {
    const response = await fetch(`${API_URL}/api/state`);
    const data = await response.json();
    updateLED(data.led_brightness);
    updateServo(data.servo_angle);
    statusText.textContent = '已連線';
    connectionStatus.classList.add('connected');
  } catch (error) {
    console.error('無法載入初始狀態:', error);
    statusText.textContent = '後端未就緒';
    connectionStatus.classList.add('disconnected');
  }
}

window.addEventListener('load', initializeState);
setInterval(initializeState, 2000);
