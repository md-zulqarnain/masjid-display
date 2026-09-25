#!/usr/bin/env python3
import json

# Minimal BME280 reader. Run on Raspberry Pi with appropriate library installed.
# It tries to import smbus2 and bme280. If not available, it returns a simulated reading.

try:
    import time
    try:
        import smbus2
        import bme280
        bus = smbus2.SMBus(1)
        calibration_params = bme280.load_calibration_params(bus, 0x76)
        data = bme280.sample(bus, 0x76, calibration_params)
        out = {
            'temperature': round(data.temperature, 2),
            'pressure': round(data.pressure, 2),
            'humidity': round(data.humidity, 2)
        }
    except Exception as e:
        # fallback: try alternate address
        try:
            import smbus2
            import bme280
            bus = smbus2.SMBus(1)
            calibration_params = bme280.load_calibration_params(bus, 0x77)
            data = bme280.sample(bus, 0x77, calibration_params)
            out = {
                'temperature': round(data.temperature, 2),
                'pressure': round(data.pressure, 2),
                'humidity': round(data.humidity, 2)
            }
        except Exception as e2:
            out = {'error': 'sensor libs not available or read failed', 'detail': str(e2)}
except Exception as e:
    out = {'error': 'unexpected failure', 'detail': str(e)}

print(json.dumps(out))
