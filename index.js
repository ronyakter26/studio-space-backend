
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
import "dotenv/config";

const PORT = 5000;
const app = express();

const AUTH_URL = process.env.BETTER_AUTH_URL;

if (!AUTH_URL) {
  throw new Error("BETTER_AUTH_URL is missing in .env");
}

const JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", AUTH_URL)
);

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

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

// JWT Verification Middleware
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Unauthorized! Please login first.",
      });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_URL,
      audience: AUTH_URL,
    });

    if (!payload.sub) {
      return res.status(401).send({
        message: "Invalid token!",
      });
    }

    req.user = {
      id: payload.sub,
    };

    next();
  } catch (error) {
    console.error("Token verification failed:", error);

    return res.status(401).send({
      message: "Invalid or expired token!",
    });
  }
}

// Home Route
app.get("/", (req, res) => {
  res.send("StudioSpace Server is Running!");
});

// Get All Studios - Public API
app.get("/api/studios", async (req, res) => {
  try {
    const studios = await studiosCollection.find({}).toArray();

    res.send(studios);
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: "Failed to fetch studios",
    });
  }
});

// Get My Studios - Protected API
app.get("/api/my-studios", verifyToken, async (req, res) => {
  try {
    const myStudios = await studiosCollection
      .find({
        ownerId: req.user.id,
      })
      .toArray();

    res.send(myStudios);
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to fetch your studios",
    });
  }
});

// Add New Studio - Protected API
app.post("/api/studios", verifyToken, async (req, res) => {
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
      ownerId: req.user.id,
      createdAt: new Date(),
    };

    if (
      !Number.isFinite(newStudio.price) ||
      newStudio.price <= 0
    ) {
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
