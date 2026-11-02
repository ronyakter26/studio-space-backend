
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

// Add New Studio
app.post("/api/studios", async (req, res) => {
  try {
    const {
      name,
      category,
      location,
      description,
      price,
      image,
    } = req.body;

    if (
      !name ||
      !category ||
      !location ||
      !description ||
      price === undefined ||
      !image
    ) {
      return res.status(400).send({
        message: "Please provide all required studio information.",
      });
    }

    const newStudio = {
      name,
      category,
      location,
      description,
      price: Number(price),
      image,
      rating: 0,
      createdAt: new Date(),
    };

    if (!Number.isFinite(newStudio.price) || newStudio.price <= 0) {
      return res.status(400).send({
        message: "Please provide a valid price.",
      });
    }

    const result = await studiosCollection.insertOne(newStudio);

    res.status(201).send({
      message: "Studio added successfully!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: "Failed to add studio.",
    });
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
