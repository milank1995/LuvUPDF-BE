import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { PDFDocument } from 'pdf-lib';

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files allowed'));
        }
    }
});



router.post('/upload-pdf', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // const url = `http://localhost:${process.env.PORT || 8001}/uploads/${req.file.filename}`;
        const url = `${process.env.API_URL || 8001}/uploads/${req.file.filename}`;
        const pdf = { url };

        res.json({ message: 'PDF uploaded successfully', pdf });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
})

function isPdfEncrypted(filePath) {
    return new Promise((resolve, reject) => {
        exec(`qpdf --show-encryption "${filePath}"`, (error, stdout, stderr) => {
            if (stdout.includes("File is not encrypted")) {
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

function encryptPDF(inputPath, outputPath, password) {
    return new Promise((resolve, reject) => {
        const command = `qpdf --encrypt ${password} ${password} 256 -- "${inputPath}" "${outputPath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error("Encryption Error:", stderr);
                return reject(error);
            }
            resolve("PDF Encrypted Successfully");
        });
    });
}

function decryptPDF(inputPath, outputPath, password) {
    return new Promise((resolve, reject) => {
        const command = `qpdf --password=${password} --decrypt "${inputPath}" "${outputPath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error("Decryption Error:", stderr);
                return reject(error);
            }
            resolve("PDF Decrypted Successfully");
        });
    });
}

router.get('/get-all-pdf', async (req, res) => {
    try {
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads', { recursive: true });
        }
        
        const files = fs.readdirSync('uploads/');

        const pdfFiles = files.filter(f => f.endsWith('.pdf'));

        const data = await Promise.all(
            pdfFiles.map(async (file) => {
                const fullPath = path.join('uploads', file);
                const isLocked = await isPdfEncrypted(fullPath);

                return {
                    // url: `http://localhost:${process.env.PORT || 8001}/uploads/${file}`,
                    url: `${process.env.API_URL || 8001}/uploads/${file}`,
                    public_id: file,
                    isLocked
                };
            })
        );

        res.json({ message: 'PDF fetch successful', data });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/lock-pdf', async (req, res) => {
    try {
        const { public_id, password } = req.body;

        if (!public_id || !password) {
            return res.status(400).json({ message: 'public_id and password required' });
        }

        const inputPath = path.join('uploads', public_id);

        if (!fs.existsSync(inputPath)) {
            return res.status(404).json({ message: 'PDF file not found' });
        }

        const outputPath = path.join('uploads', public_id.replace('.pdf', '-locked.pdf'));

        await encryptPDF(inputPath, outputPath, password);
        fs.unlinkSync(inputPath);

        res.json({ message: 'PDF locked successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/unlocked-pdf', async (req, res) => {
    try {
        const { public_id, password } = req.body;

        if (!public_id || !password) {
            return res.status(400).json({ message: 'public_id and password required' });
        }

        const inputPath = path.join('uploads', public_id);

        if (!fs.existsSync(inputPath)) {
            return res.status(404).json({ message: 'PDF file not found' });
        }

        const outputFilename = public_id.includes('-locked')
            ? public_id.replace('-locked', '')
            : public_id.replace('.pdf', '-unlocked.pdf');
        const outputPath = path.join('uploads', outputFilename);

        try {
            await decryptPDF(inputPath, outputPath, password);
            fs.unlinkSync(inputPath);

            res.json({
                message: 'PDF unlocked successfully',
                // url: `http://localhost:${process.env.PORT || 8001}/uploads/${path.basename(outputPath)}`
                url: `${process.env.API_URL || 8001}/uploads/${path.basename(outputPath)}`
            });
        } catch (error) {
            res.status(401).json({ message: error.message });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


router.post('/download-pdf', async (req, res) => {
    try {
        const { public_id } = req.body;
        
        if (!public_id) {
            return res.status(400).json({ message: 'public_id required' });
        }

        const filePath = path.resolve('uploads', public_id);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'PDF file not found' });
        }

        res.download(filePath, public_id);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});



export default router;