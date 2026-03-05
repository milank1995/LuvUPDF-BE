import mongoose from "mongoose";
import { initGridFS } from "./Gridfs.js";

export const connect = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        await initGridFS();
        console.log("DB & GridFS initialized");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1);
    }
};