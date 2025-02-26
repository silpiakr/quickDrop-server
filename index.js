const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
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
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const parceslCollection = client.db('delivery_servise').collection('parcels');

    app.get('/parcels', async(req, res) => {
        const cursor = parceslCollection.find();
        const result = await cursor.toArray();
        res.send(result);
    })

    // app.post('/', (req, res) => {
    //     const user = req.body;
    // })

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('QuickDrop server is running')
})

app.listen(port, () => {
    console.log(`QuickDrop server is waiting at: ${port}`)
})
