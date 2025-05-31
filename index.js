const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.anca8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    const usersCollection = client.db('quickDrop').collection('users');
    const parcelsCollection = client.db('quickDrop').collection('parcels');
    const parcelsBookingCollection = client.db('quickDrop').collection('bookingRequest');

    //jwt related api
    // app.post('/jwt', async (req, res) => {
    //   const user = req.body;
    //   const token = jwt.sign(user, process.env.ACCESS_TOKEN,
    //     { expiresIn: '1h' });
    //   res.send({ token });
    // })

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1h" });
      res.send({ token });
    });

    //middlewares
    const verifyToken = (req, res, next) => {
      console.log('insie verifyToken', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unaithorized access' })
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unaithorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }

    // verifyAdmin after token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    app.get('/admin/stats/bookings', verifyToken, verifyAdmin, async (req, res) => {
      const cursor = await parcelsCollection.find().toArray();

      const stats = {};

      cursor.forEach(parcel => {
        const date = new Date(parcel.bookingDate).toISOString().split('T')[0];
        if (!stats[date]) {
          stats[date] = { booked: 0, delivered: 0 };
        }
        stats[date].booked += 1;
        if (parcel.status === 'delivered') {
          stats[date].delivered += 1;
        }
      });

      res.send(stats);
    });


    //users
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      // console.log(req.headers);
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    // Save user if not exists
    app.post('/users', async (req, res) => {
      const { name, email, photo, role } = req.body;

      try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(200).json(existingUser);

        const newUser = new User({ name, email, photo, role: role || 'User' });
        await newUser.save();
        res.status(201).json(newUser);
      } catch (error) {
        res.status(500).json({ error: 'Failed to save user' });
      }
    });


    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exist', insertedId: null })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })


    app.post('/users', async (req, res) => {
      const user = req.body;
      try {
        const result = await usersCollection.insertOne(user);
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });


    //  for create admin
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })


    // Create new parcel
    app.post("/", async (req, res) => {
      try {
        const newParcel = new Parcel(req.body);
        const savedParcel = await newParcel.save();
        res.status(201).json(savedParcel);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get admin parcels
    app.get('/admin/parcels', async (req, res) => {
      try {
        const parcels = await Parcel.find().populate('userId');
        res.json(parcels);
      } catch (err) {
        res.status(500).json({ message: 'Error fetching parcels' });
      }
    });


    // Search by Date Range
    app.get('/admin/parcels/search', async (req, res) => {
      const { from, to } = req.query;

      if (!from || !to) {
        return res.status(400).json({ message: 'Please provide both from and to dates' });
      }

      const fromDate = new Date(from);
      const toDate = new Date(to);

      try {
        const parcels = await Parcel.find({
          requestedDeliveryDate: {
            $gte: fromDate,
            $lte: toDate,
          },
        }).populate('userId');

        res.json(parcels);
      } catch (err) {
        res.status(500).json({ message: 'Date range filter failed' });
      }
    });

    // Assign Delivery Man & Update 
    app.patch('/admin/parcels/:id', async (req, res) => {
      const { id } = req.params;
      const { deliveryMenId, deliveryDate } = req.body;

      try {
        const updated = await Parcel.findByIdAndUpdate(
          id,
          {
            status: 'On The Way',
            deliveryMenId,
            approximateDeliveryDate: deliveryDate,
          },
          { new: true }
        );

        res.json({ message: 'Parcel updated successfully', parcel: updated });
      } catch (err) {
        res.status(500).json({ message: 'Failed to assign delivery man' });
      }
    });



    // Get all parcels for a specific user
    app.get("/parcels/:email", async (req, res) => {
      const email = req.params.email;
      const status = req.query.status;
      const query = status ? { userEmail: email, status } : { userEmail: email };

      try {
        const parcels = await parcelsCollection.find(query).sort({ bookingDate: -1 }).toArray();
        res.json(parcels);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });


    // Update a parcel (only if status is 'pending')
    app.patch("/:id", async (req, res) => {
      const { id } = req.params;
      const updates = req.body;

      try {
        const parcel = await parcelsCollection.findById(id);
        if (!parcel) return res.status(404).json({ error: "Parcel not found" });
        if (parcel.status !== "pending") {
          return res.status(403).json({ error: "Cannot update unless status is pending" });
        }

        const updatedParcel = await parcelsCollection.findByIdAndUpdate(id, updates, { new: true });
        res.json(updatedParcel);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }); const { ObjectId } = require('mongodb');

    app.patch("/parcels/update/:id", async (req, res) => {
      const id = req.params.id;
      const updates = req.body;

      try {
        const parcel = await parcelsCollection.findOne({ _id: new ObjectId(id) });

        if (!parcel) return res.status(404).json({ error: "Parcel not found" });
        if (parcel.status !== "pending") {
          return res.status(403).json({ error: "Only pending parcels can be updated" });
        }

        const result = await parcelsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updates }
        );

        res.json({ message: "Parcel updated", result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });


    // Cancel a parcel (only if status is 'pending')
    app.patch("/parcels/cancel/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const parcel = await parcelsCollection.findOne({ _id: new ObjectId(id) });

        if (!parcel) return res.status(404).json({ error: "Parcel not found" });
        if (parcel.status !== "pending") {
          return res.status(403).json({ error: "Only pending parcels can be cancelled" });
        }

        const result = await parcelsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "canceled" } }
        );

        res.json({ message: "Parcel canceled", result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });


    // Add a review
    app.patch("/parcels/review/:id", async (req, res) => {
      const id = req.params.id;
      const { review } = req.body;

      try {
        const parcel = await parcelsCollection.findOne({ _id: new ObjectId(id) });

        if (!parcel) return res.status(404).json({ error: "Parcel not found" });
        if (parcel.status !== "delivered") {
          return res.status(403).json({ error: "Only delivered parcels can be reviewed" });
        }

        const result = await parcelsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { review } }
        );

        res.json({ message: "Review added", result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });


    // Mark as paid
    app.patch("/parcels/pay/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await parcelsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isPaid: true } }
        );

        res.json({ message: "Payment marked", result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });


    // app.get('/parcels', async (req, res) => {
    //   const email = req.query.email;

    //   let query = {};
    //   if (email) {
    //     query = { email: email };
    //   }

    //   try {
    //     const result = await parcelsCollection.find(query).toArray();
    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).send({ message: 'Error fetching parcel' });
    //   }
    // });


    // //parcel details
    // app.get('/parcels/:id', async (req, res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) }
    //   const result = await parcelsCollection.findOne(query);
    //   res.send(result);
    // })

    // app.post('/parcels', async (req, res) => {
    //   const parcels = req.body;
    //   const result = await parcelsCollection.insertOne(parcels);
    //   res.send(result);
    // })

    // //update my added parcel
    // app.put('/parcels/:id', async (req, res) => {
    //   const id = req.params.id;
    //   const pet = req.body;
    //   const updateDoc = {
    //     $set: {
    //       ...pet,
    //     },
    //   };
    //   const result = await parcelsCollection.updateOne(
    //     { _id: new ObjectId(id) },
    //     updateDoc,
    //     { upsert: true }
    //   );
    //   res.send(result);
    // });

    // app.patch('/parcels/:id', async (req, res) => {
    //   const id = req.params.id;
    //   const { booked } = req.body;
    //   const filter = { _id: new ObjectId(id) };
    //   const updateDoc = { $set: { booked } };
    //   const result = await parcelsCollection.updateOne(filter, updateDoc);
    //   res.send(result);
    // });



    // //delete my added parcel
    // app.delete('/parcels/:id', async (req, res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await parcelsCollection.deleteOne(query);
    //   res.send(result);
    // })


    // Payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { donation } = req.body;
      const amount = parseInt(donation * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    // booking request
    app.get('/bookingRequest', async (req, res) => {
      const email = req.query.email;
      const query = { email: email }
      const result = await parcelsBookingCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/bookingRequest', async (req, res) => {
      const adoptionPet = req.body;
      const result = await parcelsBookingCollection.insertOne(adoptionPet);
      res.send(result);
    })


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('QuickDrop server is running')
})

app.listen(port, () => {
  console.log(`QuickDrop server is waiting at: ${port}`)
})




// require("dotenv").config();
// const express = require("express");
// const cors = require("cors");
// const { MongoClient, ObjectId } = require("mongodb");
// const jwt = require("jsonwebtoken");

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // MongoDB Setup
// const uri = process.env.MONGO_URI;
// const client = new MongoClient(uri);

// // Collections
// let usersCollection, parcelsCollection;

// // JWT Middleware
// const verifyToken = (req, res, next) => {
//   const authHeader = req.headers.authorization;
//   if (!authHeader || !authHeader.startsWith("Bearer ")) {
//     return res.status(401).json({ message: "Unauthorized access" });
//   }

//   const token = authHeader.split(" ")[1];
//   jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//     if (err) return res.status(403).json({ message: "Forbidden access" });
//     req.decoded = decoded;
//     next();
//   });
// };

// // Connect and setup
// async function run() {
//   try {
//     await client.connect();
//     const db = client.db("parcelDB");
//     usersCollection = db.collection("users");
//     parcelsCollection = db.collection("parcels");

//     // JWT Token Creation
//     app.post("/jwt", (req, res) => {
//       const user = req.body;
//       const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1h" });
//       res.send({ token });
//     });

//     // Create User
//     app.post("/users", async (req, res) => {
//       const user = req.body;
//       const existing = await usersCollection.findOne({ email: user.email });
//       if (existing) return res.send({ message: "User already exists" });
//       const result = await usersCollection.insertOne(user);
//       res.send(result);
//     });

//     // Get All Users (Admin)
//     app.get("/users", verifyToken, async (req, res) => {
//       const result = await usersCollection.find().toArray();
//       res.send(result);
//     });

//     // Change Role (Admin)
//     app.patch("/users/role/:id", verifyToken, async (req, res) => {
//       const { id } = req.params;
//       const { role } = req.body;
//       const result = await usersCollection.updateOne(
//         { _id: new ObjectId(id) },
//         { $set: { role } }
//       );
//       res.send(result);
//     });

//     // Book a Parcel
//     app.post("/parcels", verifyToken, async (req, res) => {
//       const parcel = req.body;
//       parcel.status = "pending";
//       const result = await parcelsCollection.insertOne(parcel);
//       res.send(result);
//     });

//     // Get My Parcels
//     app.get("/parcels", verifyToken, async (req, res) => {
//       const email = req.query.email;
//       if (req.decoded.email !== email) return res.status(403).send("Forbidden");
//       const result = await parcelsCollection.find({ userEmail: email }).toArray();
//       res.send(result);
//     });

//     // Cancel Parcel (if pending)
//     app.delete("/parcels/:id", verifyToken, async (req, res) => {
//       const { id } = req.params;
//       const parcel = await parcelsCollection.findOne({ _id: new ObjectId(id) });
//       if (parcel.status !== "pending") return res.status(400).send("Cannot cancel");
//       const result = await parcelsCollection.deleteOne({ _id: new ObjectId(id) });
//       res.send(result);
//     });

//     // Update Parcel (if pending)
//     app.put("/parcels/:id", verifyToken, async (req, res) => {
//       const { id } = req.params;
//       const updates = req.body;
//       const parcel = await parcelsCollection.findOne({ _id: new ObjectId(id) });
//       if (parcel.status !== "pending") return res.status(400).send("Cannot update");
//       const result = await parcelsCollection.updateOne(
//         { _id: new ObjectId(id) },
//         { $set: updates }
//       );
//       res.send(result);
//     });

//     // Submit Review (if delivered)
//     app.post("/parcels/review/:id", verifyToken, async (req, res) => {
//       const { id } = req.params;
//       const review = req.body.review;
//       const parcel = await parcelsCollection.findOne({ _id: new ObjectId(id) });
//       if (parcel.status !== "delivered") return res.status(400).send("Cannot review");
//       const result = await parcelsCollection.updateOne(
//         { _id: new ObjectId(id) },
//         { $set: { review } }
//       );
//       res.send(result);
//     });

//     // Admin - All Parcels with filter
//     app.get("/admin/parcels", verifyToken, async (req, res) => {
//       const { from, to } = req.query;
//       const query = {};
//       if (from && to) {
//         query.requestedDeliveryDate = {
//           $gte: new Date(from),
//           $lte: new Date(to),
//         };
//       }
//       const result = await parcelsCollection.find(query).toArray();
//       res.send(result);
//     });

//     // Admin - Assign DeliveryMan
//     app.patch("/admin/parcels/:id", verifyToken, async (req, res) => {
//       const { id } = req.params;
//       const { deliveryMan, deliveryDate } = req.body;
//       const result = await parcelsCollection.updateOne(
//         { _id: new ObjectId(id) },
//         { $set: { deliveryMan, deliveryDate, status: "on the way" } }
//       );
//       res.send(result);
//     });

//     // Default route
//     app.get("/", (req, res) => {
//       res.send("Parcel Management API is running");
//     });

//     // Start server
//     app.listen(port, () => {
//       console.log(`Server is running on port ${port}`);
//     });
//   } catch (error) {
//     console.error("Server failed to start", error);
//   }
// }

// run();
