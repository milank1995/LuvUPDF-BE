import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

let bucket;

export const initGridFS = () => {
    const db = mongoose.connection.db;
    bucket = new GridFSBucket(db, { bucketName: 'pdfs' });
    
    db.collection('pdfs.files').createIndex({ 'metadata.expiresAt': 1 });
    
    return bucket;
};

export const getBucket = () => {
    if (!bucket) {
        bucket = initGridFS();
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
    const chunksCollection = db.collection('pdfs.chunks');
    
    const expiredFiles = await filesCollection.find({
        'metadata.expiresAt': { $lte: new Date() }
    }).toArray();
    
    if (expiredFiles.length === 0) return 0;
    
    const expiredIds = expiredFiles.map(f => f._id);
    
    await chunksCollection.deleteMany({ files_id: { $in: expiredIds } });
    await filesCollection.deleteMany({ _id: { $in: expiredIds } });
    
    return expiredIds.length;
};
