
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
import "dotenv/config";

const PORT = 5000;
const app = express();

const AUTH_URL = process.env.BETTER_AUTH_URL;

if (!AUTH_URL) {
  throw new Error("BETTER_AUTH_URL is missing in .env");
}

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is missing in .env");
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
let bookingsCollection;

// MongoDB Connection
async function connectToMongoDB() {
  try {
    await client.connect();

    const database = client.db("studioSpace");

    studiosCollection = database.collection("studios");
    bookingsCollection = database.collection("bookings");

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

// Update Studio - Protected API
app.put("/api/studios/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid studio ID.",
      });
    }

    const {
      name,
      category,
      location,
      description,
      price,
      image,
    } = req.body;

    if (
      !name?.trim() ||
      !category?.trim() ||
      !location?.trim() ||
      !description?.trim() ||
      price === undefined ||
      !image?.trim()
    ) {
      return res.status(400).send({
        message: "Please provide all required studio information.",
      });
    }

    const updatedPrice = Number(price);

    if (!Number.isFinite(updatedPrice) || updatedPrice <= 0) {
      return res.status(400).send({
        message: "Please provide a valid price.",
      });
    }

    const result = await studiosCollection.updateOne(
      {
        _id: new ObjectId(id),
        ownerId: req.user.id,
      },
      {
        $set: {
          name: name.trim(),
          category: category.trim(),
          location: location.trim(),
          description: description.trim(),
          price: updatedPrice,
          image: image.trim(),
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Studio not found or you are not the owner.",
      });
    }

    res.send({
      message: "Studio updated successfully!",
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to update studio.",
    });
  }
});

// Delete Request Debug Middleware
function logDeleteRequest(req, res, next) {
  console.log("DELETE REQUEST RECEIVED!");
  console.log("Request URL:", req.originalUrl);
  console.log("Studio ID:", req.params.id);
  next();
}

// Delete Studio - Protected API
app.delete(
  "/api/studios/:id",
  logDeleteRequest,
  verifyToken,
  async (req, res) => {
    try {
      console.log("Logged in User ID:", req.user.id);

      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid studio ID.",
        });
      }

      const result = await studiosCollection.deleteOne({
        _id: new ObjectId(id),
        ownerId: req.user.id,
      });

      console.log("Deleted Count:", result.deletedCount);

      if (result.deletedCount === 0) {
        return res.status(404).send({
          message: "Studio not found or you are not the owner.",
        });
      }

      res.send({
        message: "Studio deleted successfully!",
      });
    } catch (error) {
      console.error("Delete failed:", error);

      res.status(500).send({
        message: "Failed to delete studio.",
      });
    }
  }
);

// Create Booking - Protected API
app.post("/api/bookings", verifyToken, async (req, res) => {
  try {
    const {
      studioId,
      bookingDate,
      startTime,
      endTime,
    } = req.body;

    if (
      !studioId ||
      !bookingDate ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).send({
        message: "Please provide all booking information.",
      });
    }

    if (!ObjectId.isValid(studioId)) {
      return res.status(400).send({
        message: "Invalid studio ID.",
      });
    }

    const selectedStudio = await studiosCollection.findOne({
      _id: new ObjectId(studioId),
    });

    if (!selectedStudio) {
      return res.status(404).send({
        message: "Studio not found.",
      });
    }

    const date = new Date(`${bookingDate}T00:00:00`);

    if (
      Number.isNaN(date.getTime()) ||
      bookingDate < new Date().toISOString().split("T")[0]
    ) {
      return res.status(400).send({
        message: "Please select a valid booking date.",
      });
    }

    const start = startTime.split(":").map(Number);
    const end = endTime.split(":").map(Number);

    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];

    if (
      start.length !== 2 ||
      end.length !== 2 ||
      start.some((n) => !Number.isInteger(n)) ||
      end.some((n) => !Number.isInteger(n)) ||
      start[0] < 0 || start[0] > 23 ||
      end[0] < 0 || end[0] > 23 ||
      start[1] < 0 || start[1] > 59 ||
      end[1] < 0 || end[1] > 59 ||
      endMinutes <= startMinutes
    ) {
      return res.status(400).send({
        message: "Please provide valid booking times.",
      });
    }

    const duration = (endMinutes - startMinutes) / 60;
    const totalPrice = duration * Number(selectedStudio.price);
    // Check for overlapping confirmed bookings
const conflictingBooking = await bookingsCollection.findOne({
  studioId: new ObjectId(studioId),
  bookingDate,
  status: { $in: ["confirmed", "Confirmed"] },
  startTime: { $lt: endTime },
  endTime: { $gt: startTime },
});

if (conflictingBooking) {
  return res.status(409).send({
    message: "This studio is already booked for the selected time.",
  });
}

    const newBooking = {
      studioId: new ObjectId(studioId),
      studioName: selectedStudio.name,
      studioImage: selectedStudio.image,
      location: selectedStudio.location,
      userId: req.user.id,
      bookingDate,
      startTime,
      endTime,
      duration,
      totalPrice,
      status: "pending",
      createdAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(newBooking);

    res.status(201).send({
      message: "Booking created successfully!",
      bookingId: result.insertedId,
    });
  } catch (error) {
    console.error("Booking creation failed:", error);

    res.status(500).send({
      message: "Failed to create booking.",
    });
  }
});

// Get My Bookings - Protected API
app.get("/api/my-bookings", verifyToken, async (req, res) => {
  try {
    const myBookings = await bookingsCollection
      .find({
        userId: req.user.id,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(myBookings);
  } catch (error) {
    console.error("Failed to fetch bookings:", error);

    res.status(500).send({
      message: "Failed to fetch your bookings.",
    });
  }
});

// Cancel Booking - Protected API
app.patch("/api/bookings/:id/cancel", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid booking ID.",
      });
    }

    const booking = await bookingsCollection.findOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    if (!booking) {
      return res.status(404).send({
        message: "Booking not found.",
      });
    }

    if (booking.status !== "pending") {
      return res.status(400).send({
        message: "Only pending bookings can be cancelled.",
      });
    }

    await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
        },
      }
    );

    res.send({
      message: "Booking cancelled successfully!",
    });
  } catch (error) {
    console.error("Booking cancellation failed:", error);

    res.status(500).send({
      message: "Failed to cancel booking.",
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
