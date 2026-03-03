import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { uploadToGridFS, downloadFromGridFS, getAllFiles, deleteFromGridFS } from '../Utils/Gridfs.js';

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files allowed'));
        }
    }
});

router.post('/upload-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const expireMinutes = parseInt(process.env.PDF_EXPIRE_MINUTES, 10) || 5;
        const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000);
        const fileId = await uploadToGridFS(req.file.buffer, req.file.originalname, { expiresAt });

        if (!fileId) {
            return res.status(500).json({ message: 'Failed to upload PDF to database' });
        }

        res.json({ message: 'PDF uploaded successfully', fileId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

function encryptPDF(inputPath, outputPath, password) {
    return new Promise((resolve, reject) => {
        const command = `qpdf --encrypt "${password}" "${password}" 256 -- "${inputPath}" "${outputPath}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                return reject(new Error(stderr || "Encryption failed"));
            }
            resolve();
        });
    });
}

function decryptPDF(inputPath, outputPath, password) {
    return new Promise((resolve, reject) => {
        const command = `qpdf --password="${password}" --decrypt "${inputPath}" "${outputPath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                if (stderr?.toLowerCase().includes("invalid password")) {
                    return reject(new Error("INVALID_PASSWORD"));
                }
                return reject(new Error(stderr || "Decryption failed"));
            }

            resolve();
        });
    });
}

router.get('/get-all-pdf', async (req, res) => {
    try {
        const files = await getAllFiles();

        const data = await Promise.all(files.map(async file => ({
            url: `${process.env.API_URL || 'http://localhost:8001'}/api/pdf/${file._id}`,
            filename: file.filename
        })));

        res.json({ message: 'PDF fetch successful', data });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/lock-pdf', async (req, res) => {
    const { fileId, password } = req.body;

    if (!fileId || !password)
        return res.status(400).json({ message: "fileId and password required" });

    const tempDir = path.join("uploads", fileId);

    try {
        await fs.promises.mkdir(tempDir, { recursive: true });

        const inputPath = path.join(tempDir, "input.pdf");
        const outputPath = path.join(tempDir, "locked.pdf");

        const downloadStream = downloadFromGridFS(fileId);
        const writeStream = fs.createWriteStream(inputPath);

        await new Promise((resolve, reject) => {
            downloadStream.pipe(writeStream);
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
            downloadStream.on("error", reject);
        });

        await encryptPDF(inputPath, outputPath, password);

        const lockedBuffer = await fs.promises.readFile(outputPath);

        const files = await getAllFiles();
        const originalFile = files.find(
            f => f._id.toString() === fileId
        );

        const newFilename =
            originalFile.filename.replace(".pdf", "-locked.pdf");

        const newFileId =
            await uploadToGridFS(lockedBuffer, newFilename);

        await deleteFromGridFS(fileId);

        res.json({
            message: "PDF locked successfully",
            fileId: newFileId
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    } finally {
        await fs.promises.rm(tempDir, {
            recursive: true,
            force: true
        });
    }
});

router.post('/unlock-pdf', async (req, res) => {
    const { fileId, password } = req.body;

    if (!fileId || !password)
        return res.status(400).json({ message: "fileId and password required" });

    const tempDir = path.join("uploads", fileId);

    try {
        await fs.promises.mkdir(tempDir, { recursive: true });

        const inputPath = path.join(tempDir, "input.pdf");
        const outputPath = path.join(tempDir, "unlocked.pdf");

        const downloadStream = downloadFromGridFS(fileId);
        const writeStream = fs.createWriteStream(inputPath);

        await new Promise((resolve, reject) => {
            downloadStream.pipe(writeStream);
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
            downloadStream.on("error", reject);
        });

        await decryptPDF(inputPath, outputPath, password);

        const unlockedBuffer =
            await fs.promises.readFile(outputPath);

        const files = await getAllFiles();
        const originalFile =
            files.find(f => f._id.toString() === fileId);

        const newFilename =
            originalFile.filename.replace("-locked", "");

        const newFileId =
            await uploadToGridFS(unlockedBuffer, newFilename);

        await deleteFromGridFS(fileId);

        res.json({
            message: "PDF unlocked successfully",
            fileId: newFileId
        });

    } catch (error) {

        if (error.message === "INVALID_PASSWORD") {
            return res.status(401).json({
                message: "Incorrect password"
            });
        }

        res.status(500).json({
            message: error.message
        });

    } finally {
        await fs.promises.rm(tempDir, {
            recursive: true,
            force: true
        });
    }
});

router.get('/pdf/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const downloadStream = downloadFromGridFS(fileId);

        res.set('Content-Type', 'application/pdf');

        downloadStream.on('error', (error) => {
            console.error('GridFS download error:', error);
            if (!res.headersSent) {
                res.status(404).json({ message: 'PDF file not found' });
            }
        });

        downloadStream.pipe(res);
    } catch (error) {
        console.error('Route error:', error);
        res.status(500).json({ message: error.message });
    }
});

router.post('/download-pdf', async (req, res) => {
    try {
        const { fileId } = req.body;

        if (!fileId) {
            return res.status(400).json({ message: 'fileId required' });
        }

        const downloadStream = downloadFromGridFS(fileId);
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', 'attachment');

        downloadStream.pipe(res);

        downloadStream.on('error', () => {
            res.status(404).json({ message: 'PDF file not found' });
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});



export default router;