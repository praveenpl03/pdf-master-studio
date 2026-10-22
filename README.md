# PDF Master Studio

A modern, PDF editor built with Angular that enables users to edit PDF documents directly in the browser while preserving the original layout. PDF Master Studio combines advanced text recognition, font matching, image editing, page management, and document conversion into a single desktop and web application.

📥 Download

Get the latest release of PDF Master Studio for your operating system.

Platform	Download
🪟 Windows (64-bit)	Download PDF Master Studio for Windows (.exe)
🐧 Ubuntu / Debian (64-bit)	Download PDF Master Studio (.deb)

Latest Releases: https://github.com/praveenpl03/pdf-master-studio/releases

Ubuntu Store : https://snapcraft.io/pdf-master-studio
<a href="https://snapcraft.io/pdf-master-studio">
   <img alt="Get it from the Snap Store" width="200" Height="100" src="https://snapcraft.io/en/dark/install.svg"/>
</a>

Use Online : https://theconvertor--converter-97c1d.asia-southeast1.hosted.app/

System Requirements

Windows

Windows 10 or later (64-bit)


Ubuntu / Debian

Ubuntu 22.04+ / Debian 12+

Installation
Windows
Download the Windows (.exe) installer.
Run the installer.
Follow the setup wizard.
Launch PDF Master Studio from the Start Menu.
Ubuntu / Debian

Using the terminal:

sudo dpkg -i PDFMasterStudio-linux-amd64.deb
sudo apt --fix-broken install

Or simply double-click the .deb package and install it using your software manager.

## ✨ Features

### 📄 PDF Editing
- Edit text directly inside PDFs
- Preserve original fonts, colors, alignment, and formatting
- Rich text formatting (bold, italic, underline)
- Background-aware text replacement
- Smart text resizing
- Drag and reposition text

### 🖼 Image Editing
- Replace images
- Delete images
- Resize and reposition images
- Crop and rotate images

### 📑 Page Management
- Merge PDFs
- Split PDF
- Extract pages
- Delete pages
- Rotate pages
- Reorder pages using drag & drop
- Duplicate pages
- Insert blank pages

### 🔄 PDF Conversion
- PDF → Word
- PDF → HTML
- PDF → Image
- Image → PDF
- Word → PDF
- PowerPoint → PDF
- Excel → PDF

### 🎨 User Experience
- Responsive interface
- Dark mode
- Mobile support
- Thumbnail navigation
- Zoom controls
- Keyboard shortcuts
- Undo / Redo

---

# Technology Stack

- Angular 21
- TypeScript
- PDF.js
- MuPDF
- HTML5 Canvas
- Bootstrap 5
- Tailwind CSS
- RxJS
- Electron (Desktop)

---

# Installation

Clone the repository

```bash
git clone https://github.com/yourusername/pdf-master-studio.git
```

Navigate to the project

```bash
cd pdf-master-studio
```

Install dependencies

```bash
npm install
```

---

# Development Server

Start the Angular development server

```bash
ng serve
```

Open

```
http://localhost:4200
```

The application automatically reloads when source files change.

---

# Build

Development build

```bash
ng build
```

Production build

```bash
ng build --configuration production
```

The compiled application is generated inside

```
dist/
```

---

# Running Tests

Unit Tests

```bash
ng test
```

End-to-End Tests

```bash
ng e2e
```

---

# Project Structure

```
src/
│
├── app/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── models/
│   ├── shared/
│   └── layout/
│
├── assets/
├── environments/
└── styles/
```

---

# Supported Operations

- Edit PDF text
- Replace fonts
- Change colors
- Add text
- Remove text
- Insert images
- Delete images
- Watermark PDFs
- Compress PDFs
- Merge documents
- Split documents
- Rotate pages
- Export to PDF
- Export to HTML

---

# Browser Support

- Chrome
- Edge
- Firefox
- Brave

---

# Desktop Support

- Windows
- Linux
- macOS (Electron)

## Local AI model setup

The Windows and Linux desktop apps download the local Qwen3 model automatically the first time they launch. The download is about 1.07 GB, runs inside the app, and is saved in the app's own data folder. No administrator permission, folder picker, or separate model installation is needed. The home screen shows download and startup progress, and offers a retry button if setup cannot finish.

An internet connection is needed for the first download. The model is checked against a pinned SHA-256 digest before the local AI server can use it. The installer only contains the platform's local server files; it does not include the model download.

---

# Performance

- Fast PDF rendering
- Incremental page loading
- Lazy thumbnail generation
- Optimized memory usage
- GPU accelerated canvas rendering

---

# Future Roadmap

- OCR support
- Digital signatures
- AI document translation
- AI document summarization
- Collaborative editing
- Cloud storage integration
- Version history
- Batch processing
- Form designer
- PDF annotation tools

---

# Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch

```bash
git checkout -b feature/my-feature
```

3. Commit your changes

```bash
git commit -m "Add new feature"
```

4. Push your branch

```bash
git push origin feature/my-feature
```

5. Open a Pull Request

---

# License

This project is licensed under the MIT License.

---

# Author

**PDF Master Studio**

Professional PDF Editing Platform

Built with ❤️ using Angular, TypeScript, PDF.js, MuPDF and Electron.
