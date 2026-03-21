const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

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

    const texFilePath = path.join(tempDir, 'main.tex');
    const pdfFilePath = path.join(tempDir, 'main.pdf');
    const logFilePath = path.join(tempDir, 'main.log');

    // Preprocess: replace \includegraphics referencing missing files with a placeholder
    const processedCode = code.replace(
        /\\includegraphics\s*(\[[^\]]*\])?\s*\{([^}]+)\}/g,
        (match, options, filename) => {
            const imgPath = path.join(tempDir, filename);
            if (!fs.existsSync(imgPath)) {
                // Extract width from options if available (e.g. width=0.5\textwidth)
                let widthExpr = '0.8\\textwidth';
                if (options) {
                    const wMatch = options.match(/width\s*=\s*([^,\]]+)/);
                    if (wMatch) widthExpr = wMatch[1].trim();
                }
                // Render a visible placeholder box instead of the missing image
                return `\\fbox{\\parbox{${widthExpr}}{\\centering\\vspace{1.5cm}{\\small [Image not found: ${filename.replace(/_/g, '\\_')}]}\\vspace{1.5cm}}}`;
            }
            return match;
        }
    );

    // Write the processed latex code to main.tex
    fs.writeFileSync(texFilePath, processedCode, 'utf8');

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
        res.sendFile(pdfFilePath);
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

app.listen(PORT, () => {
    console.log(`LaTeX Editor server is running at http://localhost:${PORT}`);
});
