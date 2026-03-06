import express from 'express';
import { combinedLockPDF, combinedUnlockPDF, downloadPDF, getAllPDF, getSinglePDF, lockPDF, unlockPDF, uploadPDF, compressPDF } from '../Controllers/pdfController.js';
import { upload } from '../Utils/PDFUploadMulter.js';

const pdfRouter = express.Router();

pdfRouter.post('/upload-pdf', upload.single('file'), uploadPDF);

pdfRouter.get('/get-all-pdf', getAllPDF);

pdfRouter.get('/download-pdf/:fileId', downloadPDF);

pdfRouter.post('/lock-pdf', lockPDF);

pdfRouter.post('/unlock-pdf', unlockPDF);

pdfRouter.post('/combined-lock-pdf', upload.single('file'), combinedLockPDF);

pdfRouter.post('/combined-unlock-pdf', upload.single('file'), combinedUnlockPDF);

pdfRouter.post('/compress-pdf/:mode', upload.single('file'), compressPDF);

pdfRouter.get('/:fileId', getSinglePDF);



export default pdfRouter;