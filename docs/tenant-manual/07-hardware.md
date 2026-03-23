# 7. Hardware Setup

## Supported Hardware

| Device | Connection Types | Purpose |
|--------|-----------------|---------|
| **Receipt Printer** | Browser, USB, Serial, Network | Print sales receipts |
| **Barcode Scanner** | Keyboard (HID) | Scan product barcodes |
| **QR Code Reader** | Camera | QR login, QR product lookup |
| **Cash Drawer** | Via Printer | Auto-open on sale completion |
| **Touchscreen** | Native | Optimized UI for touch input |

## Receipt Printer Setup

### Browser Printing (Default)

Uses the browser's built-in print dialog:
1. No special configuration needed
2. Click Print on any receipt
3. The browser print dialog appears
4. Select your printer and print

Best for: Getting started, any printer that works with your browser.

### USB Printer

For direct USB receipt printers (e.g., Epson TM series):
1. Navigate to **Settings > Hardware** or **Admin > Hardware**
2. Set **Printer Type** to `USB`
3. Connect the printer via USB
4. Click **Test Connection**
5. Click **Save**

### Network Printer

For network-connected printers:
1. Navigate to **Settings > Hardware**
2. Set **Printer Type** to `Network`
3. Enter the printer's **IP Address** (e.g., `192.168.1.100`)
4. Enter the **Port Number** (default: `9100` for most receipt printers)
5. Click **Test Connection**
6. Click **Save**

### Serial Printer

For RS-232 serial printers:
1. Navigate to **Settings > Hardware**
2. Set **Printer Type** to `Serial`
3. Configure serial port settings
4. Click **Test Connection**
5. Click **Save**

## Barcode Scanner Setup

Most barcode scanners work in **keyboard (HID) mode** — they type the barcode as if it were keyboard input.

### Configuration

1. Connect the scanner via USB
2. Navigate to **Settings > Hardware**
3. Set **Barcode Scanner Type** to `Keyboard`
4. Toggle **Enabled** to ON
5. Click **Save**

### How It Works

1. On the POS screen, the search bar is auto-focused
2. Scan a product barcode
3. The scanner types the barcode number into the search
4. The product is automatically added to the cart

### Scanner Tips

- Ensure the scanner is set to **keyboard/HID mode** (check scanner manual)
- Some scanners add a prefix/suffix — configure to match or remove them
- Test with a known barcode before using in production
- If scan doesn't register, click the search bar to ensure it's focused

## QR Code Reader Setup

Uses the device's camera to read QR codes.

### Configuration

1. Navigate to **Settings > Hardware**
2. Toggle **QR Reader Enabled** to ON
3. Optionally select a specific **Camera ID** (for devices with multiple cameras)
4. Click **Save**

### Uses

- **QR Login** — Staff scan their QR badge to log in
- **Product Lookup** — Scan QR codes on products
- **Customer Identification** — Scan customer QR cards

### Permissions

The browser will ask for camera permission on first use. Users must click **Allow**.

## Cash Drawer Setup

Cash drawers typically connect through the receipt printer.

### Configuration

1. Navigate to **Settings > Hardware**
2. Toggle **Cash Drawer Enabled** to ON
3. Toggle **Connected to Printer** to ON (if drawer connects via printer)
4. Click **Save**

### How It Works

- The drawer opens automatically when a cash sale is completed
- Can also be opened manually from the Cash Drawer module
- The printer sends a kick command to the drawer's RJ-11 port

## Touchscreen Mode

Optimizes the UI for touch input:

1. Navigate to **Settings > Hardware**
2. Toggle **Touchscreen Enabled** to ON
3. Click **Save**

Effects:
- Larger touch targets for buttons
- On-screen numeric keypad for quantity input
- Swipe gestures enabled
- No hover-dependent UI elements

## Hardware Status

The **Hardware Status** component shows the connection state of all configured devices:

| Status | Meaning |
|--------|---------|
| **Connected** (Green) | Device is ready |
| **Disconnected** (Red) | Device not found or not responding |
| **Not Configured** (Grey) | Device not set up yet |

View hardware status on the POS screen or in **Settings > Hardware**.

## Troubleshooting

| Problem | Solution |
|---------|---------|
| Printer not detected | Check USB/network connection, restart printer |
| Print quality poor | Replace thermal paper, clean print head |
| Scanner not reading | Check HID mode, clean scanner lens, ensure barcode is clear |
| Camera permission denied | Go to browser settings > Site Permissions > Allow Camera |
| Cash drawer won't open | Check RJ-11 cable from printer to drawer, test printer command |
| Network printer timeout | Verify IP address, check network connectivity, disable firewall for port |

## Recommended Hardware

### Budget Setup
- Any USB receipt printer (58mm or 80mm thermal)
- Any USB barcode scanner (1D)
- Manual cash drawer with key

### Professional Setup
- Epson TM-T20III or TM-T88VI (network)
- Honeywell Voyager 1200g (barcode scanner)
- USB cash drawer with printer kick
- Dedicated tablet with stand for touchscreen POS
