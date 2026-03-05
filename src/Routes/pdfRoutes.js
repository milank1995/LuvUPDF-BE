import express from 'express';
import { combinedLockPDF, downloadPDF, getAllPDF, getSinglePDF, lockPDF, unlockPDF, uploadPDF } from '../Controllers/pdfController.js';
import { upload } from '../Utils/PDFUploadMulter.js';

const pdfRouter = express.Router();

pdfRouter.post('/upload-pdf', upload.single('file'), uploadPDF);

pdfRouter.get('/get-all-pdf', getAllPDF);

pdfRouter.post('/lock-pdf', lockPDF);

pdfRouter.post('/unlock-pdf', unlockPDF);

pdfRouter.post('/combined-lock-pdf', upload.single('file'), combinedLockPDF);

pdfRouter.get('/download-pdf/:fileId', downloadPDF);

pdfRouter.get('/:fileId', getSinglePDF);



export default pdfRouter;