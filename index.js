const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
// const { MongoClient, ServerApiVersion } = require('mongodb');
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// DB_PASS: PfRlajspkI1WWCdb
// DB_USER: delivery_servise


// DB_PASS = Pa44bNozVVenPQdp
// DB_USER = quickDrop


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

    const userCollection = client.db('quickDrop').collection('users');
    const parcelsCollection = client.db('quickDrop').collection('parcels'); 
    const parcelsBookingCollection = client.db('quickDrop').collection('bookingRequest');

    //jwt related api
    app.post('/jwt', async(req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN,
        {expiresIn: '1h'});
        res.send({ token });
    })

    //middlewares
    const verifyToken = (req, res, next) => {
      console.log('insie verifyToken', req.headers.authorization);
      if(!req.headers.authorization){
        return res.status(401).send({ message: 'unaithorized access' })
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if(err){
          return res.status(401).send({message: 'unaithorized access'})
        }
        req.decoded = decoded;
        next();
      })
    }

   // verifyAdmin after token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    users
    app.get('/users', verifyToken, verifyAdmin, async(req, res) => {
      // console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    })

     app.get('/users/admin/:email', verifyToken, async(req, res) => {
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'})
      }

      const query = {email: email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if(user){
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    app.post('/users', async(req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if(existingUser) {
        return res.send({message: 'user already exist', insertedId: null})
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })
  //  for create admin
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })
    
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
    //     res.status(500).send({ message: 'Error fetching parcel list' });
    //   }
    // });
    

    //parcel details
    // app.get('/parcels/:id', async(req, res) => {
    //   const id = req.params.id;
    //   const query = {_id: new ObjectId(id)}
    //   const result = await parcelsCollection.findOne(query);
    //   res.send(result);
    // })

    // app.post('/parcels', async(req, res) => {
    //   const parcels = req.body;
    //   const result = await parcelsCollection.insertOne(parcels);
    //   res.send(result);
    // })
    
    //update my added parcel
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
    


    //delete my added parcel
    // app.delete('/parcels/:id', async(req, res) => {
    //   const id = req.params.id;
    //   const query = {_id: new ObjectId(id)};
    //   const result = await parcelsCollection.deleteOne(query);
    //   res.send(result);
    // })

  
  //Payment intent
  // app.post('/create-payment-intent', async(req, res) => {
  //   const { donation } = req.body;
  //   const amount = parseInt(donation * 100);

  //   const paymentIntent = await stripe.paymentIntents.create({
  //     amount: amount,
  //     currency: "usd",
  //     payment_method_types: ['card']
  //   });
  //   res.send({
  //     clientSecret: paymentIntent.client_secret
  //   })
  // })

  //booking request
  // app.get('/bookingRequest', async(req, res) => {
  //   const email = req.query.email;
  //   const query = { email: email }
  //   const result = await parcelsBookingCollection.find(query).toArray();
  //   res.send(result);
  // })

  // app.post('/bookingRequest', async(req, res) => {
  //   const adoptionPet = req.body;
  //   const result = await parcelsBookingCollection.insertOne(adoptionPet);
  //   res.send(result);
  // })


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
