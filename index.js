
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import "dotenv/config";

const PORT = 5000;
const app = express();

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
}));

app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);

let studiosCollection;

async function connectToMongoDB() {
  try {
    await client.connect();

    const database = client.db("studioSpace");
    studiosCollection = database.collection("studios");

    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

// Home Route
app.get("/", (req, res) => {
  res.send("StudioSpace Server is Running!");
});

// Get All Studios
app.get("/api/studios", async (req, res) => {
  try {
    const studios = await studiosCollection
      .find({})
      .limit(6)
      .toArray();

    res.send(studios);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch studios" });
  }
});

// Start Server
async function startServer() {
  await connectToMongoDB();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();
