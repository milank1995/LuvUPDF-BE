import express from 'express';
import pdfRouter from './pdfRoutes.js';

const router = express.Router();

router.use('/pdf', pdfRouter)

export default router;