import express from 'express';
import { downloadPDF, getAllPDF, getSinglePDF, lockPDF, unlockPDF, uploadPDF } from '../Controllers/pdfController.js';
import { upload } from '../Utils/PDFUploadMulter.js';

const pdfRouter = express.Router();

pdfRouter.post('/upload-pdf', upload.single('file'), uploadPDF);

pdfRouter.get('/get-all-pdf', getAllPDF);

pdfRouter.post('/lock-pdf', lockPDF);

pdfRouter.post('/unlock-pdf', unlockPDF);

pdfRouter.get('/download-pdf/:fileId', downloadPDF);

pdfRouter.get('/:fileId', getSinglePDF);



export default pdfRouter;