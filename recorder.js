
let generalRecorder, specialRecorder;
let generalChunks = [], specialChunks = [];
let recordingInterval, recordingTime = 0;
let isRecording = false, isSpecialRecording = false;

const statusText = document.getElementById('status');
const recordingTimeText = document.getElementById('recordingTime');
const loudnessText = document.getElementById('loudness');
const transcriptionText = document.getElementById('transcription');

const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = 150;
const visualizerHeight = canvas.height;

navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
        generalRecorder = new MediaRecorder(stream);
        specialRecorder = new MediaRecorder(stream);

        generalRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                generalChunks.push(event.data);
            }
        };

        generalRecorder.onstop = () => {
            const audioBlob = new Blob(generalChunks, {
                type: 'audio/webm'
            });
            uploadToDropbox(audioBlob);
        };

        specialRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                specialChunks.push(event.data);
            }
        };

        specialRecorder.onstop = () => {
            const specialBlob = new Blob(specialChunks, {
                type: 'audio/webm'
            });
            sendToWhisperAI(specialBlob);
        };

        document.getElementById('startBtn').addEventListener('click', startPauseRecording);
        document.getElementById('saveBtn').addEventListener('click', saveRecording);
        
        const specialModeBtn = document.getElementById('specialModeBtn');
        specialModeBtn.addEventListener('mousedown', startSpecialRecording);
        specialModeBtn.addEventListener('mouseup', stopSpecialRecording);

        // Setup audio context and analyser for loudness
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        function calculateLoudness() {
            analyser.getByteFrequencyData(dataArray);
            let values = 0;
            for (let i = 0; i < bufferLength; i++) {
                values += dataArray[i];
            }
            const loudness = values / bufferLength;
            let loudnessStr =  Math.round(loudness * 100 / 256).toString();
          
            if (loudnessStr.length == 1) {
              loudnessStr = "00" + loudnessStr;
            }
                      if (loudnessStr.length == 2) {
              loudnessStr = "0" + loudnessStr;
            }
            loudnessText.textContent = loudnessStr;
            drawVisualizer(loudness);
            requestAnimationFrame(calculateLoudness);
        }

        calculateLoudness();
    })
    .catch(error => {
        console.error('Error accessing microphone:', error);
    });

function startPauseRecording() {
    if (generalRecorder.state === 'inactive') {
        setupRecording();
        generalChunks = [];
        generalRecorder.start();
        document.getElementById('startBtn').textContent = 'PAUSE';
        document.getElementById('saveBtn').disabled = false;
    } else if (generalRecorder.state === 'recording') {
        generalRecorder.pause();
        clearInterval(recordingInterval);
        updateStatus('Paused');
        document.getElementById('startBtn').textContent = 'RESUME';
    } else if (generalRecorder.state === 'paused') {
        generalRecorder.resume();
        startRecordingTimer();
        updateStatus('Recording...');
        document.getElementById('startBtn').textContent = 'PAUSE';
    }
}

function saveRecording() {
    generalRecorder.stop();
    clearInterval(recordingInterval);
    resetRecordingUI();
}

function startSpecialRecording() {
    specialChunks = [];
    specialRecorder.start();
    updateStatus('Special recording active...');
}

function stopSpecialRecording() {
    specialRecorder.stop();
    updateStatus('Idle');
}

function setupRecording() {
    if (!isRecording) {
        startRecordingTimer();
        isRecording = true;
        updateStatus('Recording...');
    }
}

function startRecordingTimer() {
    recordingInterval = setInterval(() => {
        recordingTime++;
        recordingTimeText.textContent = formatTime(recordingTime);
    }, 1000);
}

function resetRecordingUI() {
    isRecording = false;
    recordingTime = 0;
    recordingTimeText.textContent = '0:00';
    document.getElementById('startBtn').textContent = 'START';
    document.getElementById('saveBtn').disabled = true;
    updateStatus('Idle');
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function updateStatus(text) {
    statusText.textContent = text;
}

function uploadToDropbox(blob) {
    updateStatus('Uploading to Dropbox...');
    const dropboxApiUrl = 'https://content.dropboxapi.com/2/files/upload';

    fetch(dropboxApiUrl, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Dropbox-API-Arg': JSON.stringify({
                path: '/GeneralRecording.webm',
                mode: 'add',
                autorename: true,
                mute: false
            }),
            'Content-Type': 'application/octet-stream'
        },
        body: blob
    })
    .then(response => {
        if (response.ok) {
            updateStatus('Upload complete.');
        } else {
            return response.json().then(err => {
                throw new Error(err.error_summary);
            });
        }
    })
    .catch(error => {
        console.error('Upload failed:', error);
        updateStatus('Upload failed.');
    });
}

function sendToWhisperAI(blob) {
    updateStatus('Sending to Whisper AI...');

    const formData = new FormData();
    formData.append('file', blob, 'specialRecording.webm');
    formData.append('model', 'whisper-1');

    fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            throw new Error(data.error.message);
        }
        updateStatus('Transcription complete.');
        transcriptionText.textContent = data.text;
    })
    .catch(error => {
        console.error('Whisper AI failed:', error);
        updateStatus('Transcription failed.');
    });
}

function drawVisualizer(loudness) {
    const heightFactor = loudness * visualizerHeight / 100;
    const controlHeight = heightFactor > visualizerHeight ? visualizerHeight : heightFactor;

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    canvasCtx.fillStyle = 'lightblue';
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, visualizerHeight);
    canvasCtx.bezierCurveTo(canvas.width / 2, visualizerHeight - controlHeight,
                            canvas.width / 2, visualizerHeight - controlHeight,
                            canvas.width, visualizerHeight);
    canvasCtx.fill();
}