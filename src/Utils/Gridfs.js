import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

let bucket;

export const initGridFS = async () => {
    const db = mongoose.connection.db;
    bucket = new GridFSBucket(db, { bucketName: 'pdfs' });

    try {
        await db.collection('pdfs.files').createIndex({ 'metadata.expiresAt': 1 });
    } catch (error) {
        if (error.code === 85) { // IndexOptionsConflict
            console.log("Index conflict detected for PdfStore. Dropping and recreating index...");
            await db.collection('pdfs.files').dropIndex('metadata.expiresAt_1');
            await db.collection('pdfs.files').createIndex({ 'metadata.expiresAt': 1 });
        } else {
            console.error("Error creating index for pdfs:", error.message);
        }
    }

    return bucket;
};

export const getBucket = () => {
    if (!bucket) {
        throw new Error("GridFS bucket not initialized. Call initGridFS first.");
    }
    return bucket;
};

export const uploadToGridFS = (buffer, filename, metadata = {}) => {
    return new Promise((resolve, reject) => {
        const uploadStream = getBucket().openUploadStream(filename, {
            contentType: 'application/pdf',
            metadata
        });

        uploadStream.end(buffer);

        uploadStream.on('finish', () => {
            resolve(uploadStream.id);
        });

        uploadStream.on('error', reject);
    });
};

export const downloadFromGridFS = (fileId) => {
    return getBucket().openDownloadStream(new mongoose.Types.ObjectId(fileId));
};

export const deleteFromGridFS = (fileId) => {
    return getBucket().delete(new mongoose.Types.ObjectId(fileId));
};

export const getAllFiles = async () => {
    const files = await getBucket().find({}).toArray();
    return files;
};

export const getFileById = async (fileId) => {
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
        throw new Error("Invalid fileId");
    }

    const [file] = await getBucket()
        .find({ _id: new mongoose.Types.ObjectId(fileId) })
        .toArray();

    return file;
};

export const cleanupExpiredFiles = async () => {
    const db = mongoose.connection.db;
    const filesCollection = db.collection('pdfs.files');
    const bucket = getBucket();

    const expiredFiles = await filesCollection.find({
        'metadata.expiresAt': { $lte: new Date() }
    }).project({ _id: 1 }).toArray();

    let deletedCount = 0;

    for (const file of expiredFiles) {
        try {
            await bucket.delete(file._id);
            deletedCount++;
        } catch (err) {
            console.error("Delete error:", err.message);
        }
    }

    return deletedCount;
};
