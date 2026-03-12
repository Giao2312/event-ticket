import mongoose from "mongoose";
import env  from "./env.js";

const connectDB = async ()=> {
    try {
        await mongoose.connect(env.DB_URL );
        console.log("Database connected successfully", env.DB_URL);
    } catch (error) {
        console.error("Database connection failed:", error);
        process.exit(1);
    }
    
}

//PJzmBvsqUdNfKVBH
export default connectDB; 
