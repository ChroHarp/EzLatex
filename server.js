const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve xelatex path: prefer system PATH, fallback to MiKTeX default install location
const { execSync } = require('child_process');
let XELATEX = 'xelatex';
try {
    execSync('xelatex --version', { stdio: 'ignore' });
} catch {
    const fallback = 'C:\\Users\\' + require('os').userInfo().username +
        '\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64\\xelatex.exe';
    if (fs.existsSync(fallback)) {
        XELATEX = fallback;
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create temp directory for compilation workspace
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Setup multer for image uploads. Save directly to tempDir so LaTeX can find them easily.
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        // Keep original extension and generate a safe filename
        const ext = path.extname(file.originalname);
        const name = 'img_' + Date.now() + Math.floor(Math.random() * 1000) + ext;
        cb(null, name);
    }
});
const upload = multer({ storage });

// POST endpoint for image upload
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
    }
    // Return the filename so the frontend can insert \includegraphics{filename}
    res.json({ filename: req.file.filename });
});

// POST endpoint for compiling LaTeX
app.post('/compile', (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'No LaTeX code provided.' });
    }

    // Check for missing images before compiling
    const imgRegex = /\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g;
    const missingImages = [];
    let imgMatch;
    while ((imgMatch = imgRegex.exec(code)) !== null) {
        const imgName = imgMatch[1];
        if (!fs.existsSync(path.join(tempDir, path.basename(imgName)))) {
            missingImages.push(imgName);
        }
    }
    if (missingImages.length > 0) {
        return res.json({ success: false, missingImages });
    }

    const texFilePath = path.join(tempDir, 'main.tex');
    const pdfFilePath = path.join(tempDir, 'main.pdf');
    const logFilePath = path.join(tempDir, 'main.log');

    // Write the raw latex code to main.tex
    fs.writeFileSync(texFilePath, code, 'utf8');

    // Compile using xelatex for better support of Chinese (ctexart) and modern fonts
    const texProcess = spawn(XELATEX, ['-synctex=1', '-interaction=nonstopmode', 'main.tex'], {
        cwd: tempDir
    });

    let stdoutData = '';
    let stderrData = '';

    texProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
    });

    texProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
    });

    texProcess.on('error', (err) => {
        res.json({ success: false, log: `無法執行 xelatex：${err.message}\n請確認 MiKTeX 已正確安裝。` });
    });

    texProcess.on('close', (code) => {
        if (fs.existsSync(pdfFilePath)) {
            // PDF was generated (even if there were warnings)
            res.json({
                success: true,
                pdfUrl: `/pdf?t=${Date.now()}`
            });
        } else {
            // Compilation failed, try to read the log file
            let logContent = stdoutData;
            if (fs.existsSync(logFilePath)) {
                logContent = fs.readFileSync(logFilePath, 'utf8');
            }
            res.json({ 
                success: false, 
                log: logContent || stderrData,
                output: stdoutData
            });
        }
    });
});

// GET endpoint to serve the generated PDF
app.get('/pdf', (req, res) => {
    const pdfFilePath = path.join(tempDir, 'main.pdf');
    if (fs.existsSync(pdfFilePath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.send(fs.readFileSync(pdfFilePath));
    } else {
        res.status(404).send('PDF not found. Please compile first.');
    }
});

// GET endpoint to query synctex for reverse search
app.get('/synctex', (req, res) => {
    const { page, x, y } = req.query;
    
    if (!page || !x || !y) {
        return res.status(400).json({ error: 'Missing coordinates.' });
    }

    // synctex command expects: synctex edit -o <page>:<x>:<y>:<pdf_file>
    const pdfFilePath = path.join(tempDir, 'main.pdf');
    if (!fs.existsSync(pdfFilePath)) {
        return res.status(404).json({ error: 'PDF not found' });
    }

    // Resolve synctex path similar to xelatex
    const synctexBin = XELATEX.includes('MiKTeX')
        ? XELATEX.replace('xelatex.exe', 'synctex.exe')
        : 'synctex';
    const command = `"${synctexBin}" edit -o "${page}:${x}:${y}:${pdfFilePath}"`;

    exec(command, { cwd: tempDir, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
            console.error('SyncTeX Error:', error);
            // It might fail if no match is found, but let's see if we get partial stdout
            if (!stdout) {
                return res.json({ success: false, error: 'SyncTeX failed' });
            }
        }
        
        // Parse the stdout for "Line:123"
        const match = stdout.match(/Line:(\d+)/i);
        if (match && match[1]) {
            res.json({ success: true, line: parseInt(match[1], 10) });
        } else {
            res.json({ success: false, error: 'No line match found', raw: stdout });
        }
    });
});

// POST endpoint to download .tex + images as ZIP
app.post('/download-zip', (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'No code provided.' });
    }

    // Parse all \includegraphics references
    const regex = /\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g;
    const imageRefs = [];
    let match;
    while ((match = regex.exec(code)) !== null) {
        imageRefs.push(match[1]);
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="document.zip"');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
        res.status(500).json({ error: 'ZIP creation failed.' });
    });
    archive.pipe(res);

    // Add .tex content
    archive.append(code, { name: 'document.tex' });

    // Add referenced images from tempDir
    const missing = [];
    for (const img of imageRefs) {
        const imgPath = path.join(tempDir, path.basename(img));
        if (fs.existsSync(imgPath)) {
            archive.file(imgPath, { name: path.basename(img) });
        } else {
            missing.push(img);
        }
    }
    if (missing.length > 0) {
        archive.append(missing.join('\n'), { name: '_missing_images.txt' });
    }

    archive.finalize();
});

// POST endpoint to upload .tex + companion images
const projectUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, tempDir),
        filename: (req, file, cb) => cb(null, path.basename(file.originalname))
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.post('/upload-project', projectUpload.array('files', 50), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files provided.' });
    }

    const texFile = req.files.find(f => f.originalname.endsWith('.tex'));
    if (!texFile) {
        return res.status(400).json({ error: 'No .tex file found in upload.' });
    }

    const texContent = fs.readFileSync(texFile.path, 'utf8');
    const imageFiles = req.files.filter(f => !f.originalname.endsWith('.tex'));

    // Check which referenced images were included in the upload
    const regex = /\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g;
    const referencedImages = [];
    let match;
    while ((match = regex.exec(texContent)) !== null) {
        referencedImages.push(match[1]);
    }

    const uploadedImages = imageFiles.map(f => f.originalname);
    const missingImages = referencedImages.filter(ref =>
        !uploadedImages.includes(ref) && !fs.existsSync(path.join(tempDir, ref))
    );

    res.json({ texContent, uploadedImages, missingImages });
});

app.listen(PORT, () => {
    console.log(`LaTeX Editor server is running at http://localhost:${PORT}`);
});
