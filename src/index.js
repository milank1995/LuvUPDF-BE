import "dotenv/config";
import "reflect-metadata";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import router from "./Routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


async function createServer() {
    const app = express();

    app.use(cors({
        origin: true,
        credentials: true,
    }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

    app.use('/api', router);

    app.listen(process.env.PORT || 8001, () => {
        console.log(`Server running on port ${process.env.PORT || 8001}`);
    });

    return app;
}

createServer()
    .then(() => {
        console.log("Server started successfully");
    })
    .catch((err) => {
        console.error("Failed to start server:", err);
        // process.exit(1);
    });
