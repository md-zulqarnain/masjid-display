# Masjid Display - Theme System Documentation

## Overview
The Masjid Display system now supports 4 different theme variations, each with unique UI/UX design and color schemes. Users can easily switch between themes through the admin panel.

---

## Available Themes

### 1. **Theme 1: Modern Gradient** (Pink/Purple)
- **File**: `theme-1.html` with `theme-1.css`
- **Color Scheme**: Modern pink (#ff6b9d) and purple gradients
- **Design**: Refined gradients with modern UI elements
- **Best For**: Contemporary, vibrant displays
- **Key Colors**:
  - Primary: #ff6b9d (Pink)
  - Accent: #ff8fab (Light Pink)
  - Background: Purple gradient (#1a0e2e to #3d2a5f)

### 2. **Theme 2: Minimalist Dark** (Grayscale)
- **File**: `theme-2.html` with `theme-2.css`
- **Color Scheme**: Clean grayscale with neutral tones
- **Design**: Simple, minimal, focus on text readability
- **Best For**: Professional, corporate environments
- **Key Colors**:
  - Primary: #e0e0e0 (Light Gray)
  - Accent: #b0b0b0 (Medium Gray)
  - Background: Dark (#0a0a0a to #1a1a1a)

### 3. **Theme 3: Premium Glass** (Cyan Blue)
- **File**: `theme-3.html` with `theme-3.css`
- **Color Scheme**: Cyan blue with glassmorphism effects
- **Design**: Modern glassmorphism with subtle depth
- **Best For**: Premium, modern institutions
- **Key Colors**:
  - Primary: #00bfff (Cyan)
  - Accent: #00a8d8 (Dark Cyan)
  - Background: Deep blue gradient (#0d1b2a to #0f2e47)
  - Features: Glass effect with backdrop blur

### 4. **Theme 4: Vibrant Neon** (Green/Cyan)
- **File**: `theme-4.html` with `theme-4.css`
- **Color Scheme**: Bold neon green and cyan with glow effects
- **Design**: Eye-catching, modern, futuristic
- **Best For**: Youth centers, modern facilities
- **Key Colors**:
  - Primary: #00ff00 (Neon Green)
  - Secondary: #00ffff (Neon Cyan)
  - Accent: #ff00ff (Magenta)
  - Background: Dark purple (#0a0a1a to #2a0a4a)
  - Features: Text shadows and glow effects

---

## How to Use Themes

### For Administrators

1. **Access Admin Panel**
   - Navigate to the admin panel
   - Go to the "Settings" tab

2. **Select a Theme**
   - Click the "Display Theme" dropdown
   - Choose from:
     - Theme 1: Modern Gradient (Pink/Purple)
     - Theme 2: Minimalist Dark (Grayscale)
     - Theme 3: Premium Glass (Cyan Blue)
     - Theme 4: Vibrant Neon (Green/Cyan)

3. **Apply Theme**
   - Click "Apply Theme" button
   - The display will automatically switch to the selected theme on next page refresh

### For Display Users

- The selected theme will automatically load when the display page opens
- Themes include all the same prayer time information, just with different visual styling
- All themes are responsive and work on various screen sizes

---

## Theme Features

### Common Features Across All Themes
- ✅ Prayer time display table with Azan and Jamah times
- ✅ Next prayer countdown timer
- ✅ Current Islamic date (Hijri)
- ✅ Juma prayer times section
- ✅ Verse/Hadith slider
- ✅ Responsive design for different screen sizes
- ✅ Smooth animations and transitions
- ✅ Clock display with AM/PM

### Theme-Specific Features

**Theme 1 & 3**:
- Glassmorphism effect
- Backdrop blur for modern look
- Refined shadow effects

**Theme 2**:
- Minimal decorations
- Maximum readability
- Flat, clean design

**Theme 4**:
- Neon glow effects
- Text shadows for depth
- High contrast colors
- Animated borders with glow

---

## File Structure

```
public/
├── index.html (Default - uses style.css)
├── style.css (Default theme styles)
├── theme-1.html (Modern Gradient theme)
├── theme-1.css (Modern Gradient styles)
├── theme-2.html (Minimalist Dark theme)
├── theme-2.css (Minimalist Dark styles)
├── theme-3.html (Premium Glass theme)
├── theme-3.css (Premium Glass styles)
├── theme-4.html (Vibrant Neon theme)
├── theme-4.css (Vibrant Neon styles)
├── admin-panel.html (Updated with theme selector)
├── app.js (Updated with theme loader)
└── ...other files
```

---

## Technical Implementation

### Settings Storage
- Themes are stored in `data/settings.json`
- Current theme setting field: `"theme": "theme-1"` (or "theme-2", "theme-3", "theme-4", "index")

### API Endpoints
- **GET** `/api/settings` - Retrieves current settings including theme
- **POST** `/api/theme` - Saves the selected theme
  ```json
  {
    "theme": "theme-1"
  }
  ```

### Auto-Loading
- `app.js` now includes a `loadSelectedTheme()` function
- On page load, the display checks the current theme setting
- If a specific theme is selected, the page redirects to that theme's HTML file
- If no theme is selected, the default `index.html` is used

---

## Customization Tips

### To Create Your Own Theme:
1. Create a new `theme-X.html` file (copy from one of the existing themes)
2. Create a corresponding `theme-X.css` file
3. Customize the CSS colors and styles
4. Update admin panel dropdown to include the new theme
5. Update the `saveSettings()` function in `server.js` to validate the new theme

### Color Variables to Customize:
- Primary color (accent text, borders)
- Background gradient
- Secondary colors
- Border colors
- Shadow colors
- Glow colors (for neon themes)

---

## Notes

- All themes include the same underlying HTML structure, only CSS differs
- Themes are fully responsive and tested on portrait and landscape orientations
- Switching themes is instant after page refresh
- Previous theme selection is preserved in settings even after server restart

---

## Support

For any issues with theme switching or display, check:
1. Admin panel "Apply Theme" button response
2. Server logs for API errors
3. Browser console for JavaScript errors
4. Display page's network activity

Themes are stored in the settings file, so they persist across restarts.
