# Masjid Display System - Admin Guide

## Overview
This system displays prayer times and videos for Jama Masjid Jhirniya Shaikh with an admin interface to manage content.

## Features

### Display Screen (index.html)
- Shows current time with Gregorian and Hijri dates
- Displays prayer times in a table
- Highlights the next upcoming prayer
- Plays videos for 30 seconds every 5 minutes
- Cycles through all videos in the videos folder

### Admin Panel (admin-panel.html)

#### Login
- **Username**: `admin`
- **Password**: `admin123`
- Access: `http://localhost:3000/login.html`

#### Prayer Times Management
1. Select a month from the dropdown
2. Each prayer shows all days of that month
3. Click on a day to edit its times
4. Edit Azan and Jamah times
5. Click "Save Prayer Times" to save changes

#### Video Management
1. **Upload Videos**: Drag and drop or click to upload MP4, WebM, OGG, or MOV files
2. **Delete Videos**: Click the delete button on any video card
3. Videos are automatically rotated on the display

## Setup

### Creating Monthly Timing Files
Create files named `timing-data-1.json` to `timing-data-12.json` for each month:
- `timing-data-1.json` = January
- `timing-data-2.json` = February
- And so on...

### File Structure
```json
{
  "fajr": [
    ["04:30", "06:15"],  // Day 1: [Azan time, Jamah time]
    ["04:29", "06:14"],  // Day 2
    ...
  ],
  "dhuhr": [...],
  "asr": [...],
  "maghrib": [...],
  "isha": [...]
}
```

### API Endpoints

#### Get Prayer Times for a Month
```
GET /api/timings/:month
```
Returns prayer times for the specified month (1-12)

#### Update Prayer Times for a Month
```
POST /api/timings/:month
Body: { "prayer_name": [["azan", "jamah"], ...], ... }
```

#### Get Available Months
```
GET /api/available-months
```
Returns array of available month numbers

#### Get Videos List
```
GET /api/videos
```
Returns array of video file paths

#### Upload Video
```
POST /api/upload-video
Form Data: video (file)
```

#### Delete Video
```
DELETE /api/video/:filename
```

## Server Details
- **Port**: 3000
- **Start**: `node server.js`
- **Address**: `http://localhost:3000`

## Directory Structure
```
masjid-display/
├── public/
│   ├── index.html          (Display screen)
│   ├── app.js              (Display logic)
│   ├── admin-panel.html    (Admin interface)
│   ├── login.html          (Admin login)
│   ├── style.css           (Display styles)
│   └── videos/             (Video files)
├── timing-data-1.json      (January timings)
├── timing-data-2.json      (February timings)
├── ... (more months)
├── server.js               (Express server)
├── package.json
└── config.json
```

## Usage

### Daily Display
The display automatically:
1. Loads prayer times for the current month and day
2. Updates the clock every second
3. Shows the next upcoming prayer highlighted in green
4. Plays videos from the videos folder in sequence every 5 minutes for 30 seconds

### Admin Operations
1. **Login**: Go to admin panel login page
2. **Manage Prayers**: Update Azan and Jamah times for any day
3. **Manage Videos**: Upload or delete videos as needed

## Customization

### Change Login Credentials
Edit `login.html` - search for:
```javascript
const validUsername = 'admin';
const validPassword = 'admin123';
```

### Change Video Rotation Time
Edit `app.js` - search for:
```javascript
setInterval(playVideoInterval, 5 * 60 * 1000); // 5 minutes
```

### Change Video Duration
Edit `app.js` - search for:
```javascript
}, 30 * 1000); // 30 seconds
```

## Troubleshooting

### Videos not showing
1. Make sure videos are in `public/videos/` folder
2. Check browser console (F12) for errors
3. Restart the server

### Prayer times not updating
1. Verify timing-data files exist and are valid JSON
2. Check that the current month file exists
3. Reload the display page

### Admin panel not accessible
1. Clear browser cache and cookies
2. Check that server is running
3. Verify session storage is enabled

## Security Notes
- This is a basic authentication system for demonstration
- For production use, implement proper backend authentication
- Store sensitive data securely
- Use HTTPS in production
- Never commit credentials to version control
