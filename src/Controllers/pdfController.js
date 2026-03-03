import fs from 'fs';
import path from 'path';
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

export const lockPDF = async (req, res) => {

    const { fileId, password } = req.body;

    if (!fileId || !password)
        return res.status(400).json({
            message: "fileId and password required"
        });

    const tempDir = path.join("uploads", randomUUID());

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
                if (!res.headersSent) {
                    res.status(404).json({ message: err.message });
                } else {
                    res.end();
                }
            });
        });

        await pdfProcessLimiter(() => encryptPDF(inputPath, outputPath, password));

        const lockedBuffer = await fs.promises.readFile(outputPath);
        const originalFile = await getFileById(fileId);

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

    const tempDir = path.join("uploads", randomUUID());

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
                if (!res.headersSent) {
                    res.status(404).json({ message: err.message });
                }
                reject(err);
            });
        });

        await pdfProcessLimiter(() => decryptPDF(inputPath, outputPath, password));

        const unlockedBuffer = await fs.promises.readFile(outputPath);

        const file = await getFileById(fileId);

        const newFilename = file.filename.replace("-locked", "");

        const newFileId = await uploadToGridFS(unlockedBuffer, newFilename);

        await deleteFromGridFS(fileId);

        res.json({
            message: "PDF unlocked successfully",
            fileId: newFileId
        });

    } catch (error) {
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