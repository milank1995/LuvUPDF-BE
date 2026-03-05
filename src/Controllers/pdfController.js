import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from "crypto";
import { spawn } from 'child_process';
import { uploadToGridFS, downloadFromGridFS, getAllFiles, deleteFromGridFS, getFileById } from '../Utils/Gridfs.js';
import pLimit from 'p-limit';

const pdfProcessLimiter = pLimit(parseInt(process.env.PROCESS_LIMITER) || 5);

export const uploadPDF = async (req, res) => {
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
}

export const getAllPDF = async (req, res) => {
    try {
        const files = await getAllFiles();

        const data = files.map(file => ({
            url: `${process.env.API_URL || 'http://localhost:8001'}/api/pdf/${file._id}`,
            filename: file.filename
        }));

        res.json({ message: 'PDF fetch successful', data });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const combinedLockPDF = async (req, res) => {
    const { password } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!password) {
        return res.status(400).json({ message: 'Password is required' });
    }

    const tempDir = path.join(os.tmpdir(), 'pdf-lock-' + randomUUID());
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputPath = path.join(tempDir, 'locked.pdf');

    try {
        await fs.promises.mkdir(tempDir, { recursive: true });
        await fs.promises.writeFile(inputPath, req.file.buffer);

        await pdfProcessLimiter(() => encryptPDF(inputPath, outputPath, password));

        const lockedBuffer = await fs.promises.readFile(outputPath);
        const filename = req.file.originalname.replace('.pdf', '-locked.pdf');

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': lockedBuffer.length
        });

        res.send(lockedBuffer);

    } catch (error) {
        console.error('Combined Lock PDF error:', error);
        res.status(500).json({ message: error.message });
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
}

export const combinedUnlockPDF = async (req, res) => {
    const { password } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!password) {
        return res.status(400).json({ message: 'Password is required' });
    }

    const tempDir = path.join(os.tmpdir(), 'pdf-unlock-' + randomUUID());
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputPath = path.join(tempDir, 'unlocked.pdf');

    try {
        await fs.promises.mkdir(tempDir, { recursive: true });
        await fs.promises.writeFile(inputPath, req.file.buffer);

        await pdfProcessLimiter(() => decryptPDF(inputPath, outputPath, password));

        const unlockedBuffer = await fs.promises.readFile(outputPath);
        const filename = req.file.originalname.replace(/\.pdf$/i, '-unlocked.pdf');

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': unlockedBuffer.length
        });

        res.send(unlockedBuffer);

    } catch (error) {
        console.error('Combined Unlock PDF error:', error);

        if (error.message === 'INVALID_PASSWORD') {
            return res.status(401).json({ message: 'Incorrect password' });
        }

        res.status(500).json({ message: error.message });
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
}

export const lockPDF = async (req, res) => {

    const { fileId, password } = req.body;

    if (!fileId || !password)
        return res.status(400).json({
            message: "fileId and password required"
        });

    const tempDir = path.join(os.tmpdir(), "pdf-task-" + randomUUID());

    const inputPath = path.join(tempDir, "input.pdf");
    const outputPath = path.join(tempDir, "locked.pdf");

    try {

        await fs.promises.mkdir(tempDir, { recursive: true });

        const downloadStream = downloadFromGridFS(fileId);
        const writeStream = fs.createWriteStream(inputPath);

        await new Promise((resolve, reject) => {
            downloadStream.pipe(writeStream);
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
            downloadStream.on('error', (err) => {
                reject(err);
            });
        });

        await pdfProcessLimiter(() => encryptPDF(inputPath, outputPath, password));

        const lockedBuffer = await fs.promises.readFile(outputPath);
        const originalFile = await getFileById(fileId);

        if (!originalFile) {
            throw new Error("Original file not found");
        }

        const newFilename = originalFile.filename.replace(".pdf", "-locked.pdf");

        const expireMinutes = parseInt(process.env.PDF_EXPIRE_MINUTES, 10) || 5;
        const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000);
        const newFileId = await uploadToGridFS(lockedBuffer, newFilename, { expiresAt });

        await deleteFromGridFS(fileId);

        return res.json({
            message: "PDF locked successfully",
            fileId: newFileId
        });

    } catch (error) {
        console.error("Lock PDF error:", error);
        return res.status(500).json({
            message: error.message
        });
    } finally {
        await fs.promises.rm(tempDir, {
            recursive: true,
            force: true
        });
    }
};

export const unlockPDF = async (req, res) => {

    const { fileId, password } = req.body;

    if (!fileId || !password)
        return res.status(400).json({ message: "fileId and password required" });

    const tempDir = path.join(os.tmpdir(), "pdf-task-" + randomUUID());

    const inputPath = path.join(tempDir, "input.pdf");
    const outputPath = path.join(tempDir, "unlocked.pdf");

    try {
        await fs.promises.mkdir(tempDir, { recursive: true });

        const downloadStream = downloadFromGridFS(fileId);
        const writeStream = fs.createWriteStream(inputPath);

        await new Promise((resolve, reject) => {
            downloadStream.pipe(writeStream);
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
            downloadStream.on("error", (err) => {
                reject(err);
            });
        });

        await pdfProcessLimiter(() => decryptPDF(inputPath, outputPath, password));

        const unlockedBuffer = await fs.promises.readFile(outputPath);

        const file = await getFileById(fileId);

        if (!file) {
            throw new Error("Original file not found");
        }

        const newFilename = file.filename.replace("-locked", "");

        const expireMinutes = parseInt(process.env.PDF_EXPIRE_MINUTES, 10) || 5;
        const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000);
        const newFileId = await uploadToGridFS(unlockedBuffer, newFilename, { expiresAt });

        await deleteFromGridFS(fileId);

        res.json({
            message: "PDF unlocked successfully",
            fileId: newFileId
        });

    } catch (error) {
        console.error("Unlock PDF error:", error);
        if (res.headersSent) {
            return;
        }

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
}

export const getSinglePDF = async (req, res) => {
    try {
        const { fileId } = req.params;

        if (!fileId) {
            return res.status(400).json({ message: 'fileId required' });
        }

        const downloadStream = downloadFromGridFS(fileId);
        res.set('Content-Type', 'application/pdf');

        downloadStream.on('error', (error) => {
            if (!res.headersSent) {
                res.status(404).json({ message: error.message });
            }
        });
        downloadStream.pipe(res);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const downloadPDF = async (req, res) => {
    try {
        const { fileId } = req.params;

        if (!fileId) {
            return res.status(400).json({ message: 'fileId required' });
        }

        const downloadStream = downloadFromGridFS(fileId);
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', 'attachment');

        downloadStream.on('error', (error) => {
            if (!res.headersSent) {
                res.status(404).json({ message: error.message });
            }
        });
        downloadStream.pipe(res);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}



function encryptPDF(inputPath, outputPath, password) {
    return new Promise((resolve, reject) => {
        const qpdf = spawn('qpdf', [
            '--encrypt', password, password, '256',
            '--', inputPath, outputPath
        ]);

        qpdf.on('error', (err) => {
            if (err.code === 'ENOENT') {
                reject(new Error("qpdf is not installed on the system. Please install it to use this feature (winget install qpdf)."));
            } else {
                reject(err);
            }
        });

        let stderr = '';
        qpdf.stderr.on('data', (data) => stderr += data);

        qpdf.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(stderr || "Encryption failed"));
            }
            resolve();
        });
    });
}


function decryptPDF(inputPath, outputPath, password) {
    return new Promise((resolve, reject) => {
        const qpdf = spawn('qpdf', [
            `--password=${password}`,
            '--decrypt',
            inputPath,
            outputPath
        ]);

        let stderr = '';
        qpdf.stderr.on('data', (data) => stderr += data);

        qpdf.on('close', (code) => {
            if (code !== 0) {
                if (stderr?.toLowerCase().includes("invalid password")) {
                    return reject(new Error("INVALID_PASSWORD"));
                }
                return reject(new Error(stderr || "Decryption failed"));
            }
            resolve();
        });
    });
}