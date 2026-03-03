import "dotenv/config";
import "reflect-metadata";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./Routes/index.js";
import { connect } from "./Utils/DbConnect.js";
import { initCronJobs } from "./Utils/RemovePdfCron.js";

async function createServer() {
    connect();
    initCronJobs();
    const app = express();

    app.use(cors({
        origin: true,
        credentials: true,
    }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

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
    });
