// sensor.js - fetches /api/sensor and updates sensor UI
async function fetchSensor() {
  try {
    const res = await fetch('/api/sensor');
    const data = await res.json();
    updateSensorUI(data);
  } catch (err) {
    console.error('Sensor fetch failed', err);
    updateSensorUI({ temperature: null, humidity: null, note: 'fetch-error' });
  }
}

function updateSensorUI(data) {
  const elTemp = document.getElementById('sensor-temp-left') || document.getElementById('sensor-temp') || document.getElementById('sensor-temp-left');
  const elHum = document.getElementById('sensor-hum-right') || document.getElementById('sensor-hum') || document.getElementById('sensor-hum-right');
  const elTime = document.getElementById('sensor-time');

  if (!elTemp || !elHum) return;

  if (data && typeof data.temperature === 'number') {
    const newVal = data.temperature.toFixed(1) + ' °C';
    if (elTemp.textContent !== newVal) {
      elTemp.classList.add('sensor-updated');
      setTimeout(() => elTemp.classList.remove('sensor-updated'), 900);
    }
    elTemp.textContent = newVal;
  } else if (data && data.temperature === null) {
    elTemp.textContent = '-- °C';
  } else if (data && data.error) {
    elTemp.textContent = 'Err';
  }

  if (data && typeof data.humidity === 'number') {
    const newValH = data.humidity.toFixed(0) + ' %';
    if (elHum.textContent !== newValH) {
      elHum.classList.add('sensor-updated');
      setTimeout(() => elHum.classList.remove('sensor-updated'), 900);
    }
    elHum.textContent = newValH;
  } else {
    elHum.textContent = '-- %';
  }

  if (elTime) {
    if (data && data.at) {
      const d = new Date(data.at);
      const t = d.toLocaleTimeString();
      if (elTime.textContent !== t) {
        elTime.classList.add('sensor-updated');
        setTimeout(() => elTime.classList.remove('sensor-updated'), 900);
      }
      elTime.textContent = t;
    } else {
      elTime.textContent = '';
    }
  }

  // no floating widget behaviour — inline badges only
}

// start polling every 10s
setInterval(fetchSensor, 10000);
window.addEventListener('load', fetchSensor);
