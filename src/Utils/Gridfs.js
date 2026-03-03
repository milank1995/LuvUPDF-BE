import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

let bucket;

export const initGridFS = () => {
    const db = mongoose.connection.db;
    bucket = new GridFSBucket(db, { bucketName: 'pdfs' });
    
    db.collection('pdfs.files').createIndex(
        { 'metadata.expiresAt': 1 },
        { expireAfterSeconds: 0 }
    );
    
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

export const cleanupOrphanChunks = async () => {
    const db = mongoose.connection.db;
    const filesCollection = db.collection('pdfs.files');
    const chunksCollection = db.collection('pdfs.chunks');
    
    const fileIds = await filesCollection.distinct('_id');
    const result = await chunksCollection.deleteMany({ files_id: { $nin: fileIds } });
    
    return result.deletedCount;
};
