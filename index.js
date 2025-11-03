const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId, Timestamp } = require('mongodb')
const jwt = require('jsonwebtoken')
const Stripe = require('stripe')
const stripe = new Stripe(process.env.VITE_STRIPE_SK);
const nodemailer = require("nodemailer");

const port = process.env.PORT || 8000

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174','https://acommoclient.web.app'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ht5sdry.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {

    const roomsCollections = client.db('Acommo').collection('rooms')
    const usersCollections = client.db('Acommo').collection('users')
    const bookingsCollections = client.db('Acommo').collection('bookings')


    // email step 1 

    const sendEmail = (emailAddress, emailData) => {

      // Create a test account or replace with real credentials.
      const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.email.com",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.TRANSPORTER_EMAIL,
          pass: process.env.TRANSPORTER_EMAIL_PASS,
        },
      });



      //verify step 3. from nodemailer smtp
      // Promise style (Node.js 8+)
      try {
        transporter.verify();
        console.log("Server is ready to take our messages");
      } catch (err) {
        console.error("Verification failed", err);
      }

      // Callback style
      transporter.verify((error, success) => {
        if (error) {
          console.error(error);
        } else {
          console.log("Server is ready to take our messages");
        }
      });


      //step 2 nodemailer
      // Wrap in an async IIFE so we can use await.
      (async () => {
        const mailBody = {
          from: `"Acommo" <${process.env.TRANSPORTER_EMAIL}>`,
          to: emailAddress,
          subject: emailData.subject,

          html: emailData.message, // HTML body
        }
        await transporter.sendMail(mailBody, (error, info) => {
          if (error) {
            console.log(error);
          }
          else {
            console.log("email send" + info.response);
          }
        });


      })();

    }


    // verify admin middleware

    const verifyAdmin = async (req, res, next) => {

      const user = req.user
      const query = { email: user?.email }
      const result = await usersCollections.findOne(query)

      if (!result || result?.role !== "admin") res.status(401).send({ message: "unauthorized access" })
      next()
    }


    const verifyHost = async (req, res, next) => {

      const user = req.user
      const query = { email: user?.email }
      const result = await usersCollections.findOne(query)

      if (!result || result?.role !== "host") res.status(401).send({ message: "unauthorized access" })
      next()
    }


    //// payment intent


    // ✅ Create Payment Intent endpoint
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      try {
        const { price } = req.body;

        // Stripe expects amount in cents
        const amount = Math.round(price * 100);

        // Create a payment intent
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        // Send client secret to frontend
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (err) {
        console.error("Stripe error:", err.message);
        res.status(500).send({ error: err.message });
      }
    });


    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
        console.log('Logout successful')
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // user create , update
    app.put('/user', async (req, res) => {
      const user = req.body;
      const query = { email: user?.email }
      console.log("Received user:", user);

      const isExist = await usersCollections.findOne({ email: user?.email })

      if (isExist) {
        if (user.status === 'Requested') {
          const result = await usersCollections.updateOne(query, { $set: { status: user?.status } })
          return res.send(result)

        }
        else {
          return res.send(isExist)
        }
      }

      const options = { upsert: true }

      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now()
        }
      };

      const result = await usersCollections.updateOne(query, updateDoc, options)
      // send mail user for welcoming
      sendEmail(user?.email, {
        subject: "Welcome to Acommo",
        message: `Welcome to Acommo! We are delighted to have you as our guest and are committed to providing you with a comfortable and memorable stay. As a first-time guest, we want to ensure that you have a seamless and enjoyable experience with us.`,
      })

      res.send(result)
    })

    // get all user data from db

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollections.find().toArray()
      res.send(result)
    })

    // ✅ Update user role
    app.patch('/users/:id', async (req, res) => {
      try {
        const id = req.params.id
        const { role } = req.body

        if (!role) {
          return res.status(400).send({ message: 'Role field required' })
        }

        const filter = { _id: new ObjectId(id) }
        const updateDoc = {
          $set: { role: role, status: 'Verified', timestamp: Date.now() },
        }

        const result = await usersCollections.updateOne(filter, updateDoc)
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: 'Failed to update user', error })
      }
    })

    // get user role

    app.get('/user/:email', async (req, res) => {
      try {
        const email = req.params.email
        const result = await usersCollections.findOne({ email })
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: error.message })
      }
    })


    app.get('/rooms', async (req, res) => {

      const category = req.query.category;

      let query = {};
      if (category && category != 'null') {
        query = { category }
      }
      const result = await roomsCollections.find(query).toArray()
      res.send(result);

    })


    app.get('/room/:id', async (req, res) => {
      const id = req.params.id
      const cleanId = id.replace(/"/g, '');
      const result = await roomsCollections.findOne({ _id: new ObjectId(cleanId) })
      res.send(result);

    })
    // add room by host
    app.post('/addroom', verifyToken, verifyHost, async (req, res) => {
      const roomData = req.body;
      const result = await roomsCollections.insertOne(roomData)
      res.send(result);
    })

    // add bookings by 
    app.post('/bookings', verifyToken, async (req, res) => {
      const bookingsData = req.body;
      const result = await bookingsCollections.insertOne(bookingsData)
      //send  email to user
      sendEmail(bookingsData?.guest?.email, {
        subject: "Booking Successful!",
        message: `You have successfully booked a room through Acommo .Your transaction Id is 
       ${bookingsData?.transactionId}`,
      })

      res.send(result);
    })


    // Get all bookings for a specific room
    app.get('/bookings/:roomId', async (req, res) => {
      try {
        const roomId = req.params.roomId;
        const bookings = await bookingsCollections.find({ roomId }).toArray();
        res.send(bookings);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch room bookings" });
      }
    });

    // ✅ Get all bookings (optionally filter by user email)
    app.get('/bookings', async (req, res) => {
      try {
        const email = req.query.email;
        const query = email ? { 'guest.email': email } : {}; // filter if email given

        const bookings = await bookingsCollections.find(query).toArray();
        res.send(bookings);
      } catch (err) {
        console.error('Error fetching bookings:', err);
        res.status(500).send({ message: 'Failed to fetch bookings' });
      }
    });
    // delete
    app.delete('/bookings/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await bookingsCollections.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0)
          return res.status(404).send({ message: 'Booking not found' });

        res.send({ message: 'Booking cancelled successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to cancel booking' });
      }
    });




    // Get mylistings by host email
    app.get('/my-rooms/:email', verifyToken, verifyHost, async (req, res) => {
      try {
        const email = req.params.email;
        const result = await roomsCollections.find({ 'host.email': email }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });
    // Delete room by ID
    app.delete('/room/:id', verifyToken, verifyHost, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await roomsCollections.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Update room by ID
    app.put('/room/:id', verifyToken, verifyHost, async (req, res) => {
      try {
        const id = req.params.id;
        const room = req.body;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateRoom = {
          $set: {
            title: room.title,
            location: room.location,
            category: room.category,
            price: room.price,
            total_guest: room.total_guest,
            bedrooms: room.bedrooms,
            bathrooms: room.bathrooms,
            description: room.description,
            image_url: room.image_url,
            availability: room.availability
          }
        };
        const result = await roomsCollections.updateOne(filter, updateRoom, options);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });


    // admin
    app.get('/admin-statistics', verifyToken, verifyAdmin, async (req, res) => {
      try {
        // First, let's check if we have any bookings and log the date format
        const sampleBooking = await bookingsCollections.findOne({});
        console.log('Sample booking date:', sampleBooking?.date);

        // Get total statistics first 
        const totalStats = await bookingsCollections.aggregate([
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              totalRevenue: { $sum: '$price' }
            }
          }
        ]).toArray();

        // Get monthly data 
        const monthlyData = await bookingsCollections.aggregate([
          {
            $addFields: {
              // Convert date string to date object if needed
              //new to me, 
              parsedDate: {
                $cond: {
                  if: { $eq: [{ $type: '$date' }, 'string'] },
                  then: { $dateFromString: { dateString: '$date' } },
                  else: '$date'
                }
              }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$parsedDate' },
                month: { $month: '$parsedDate' }
              },
              bookings: { $sum: 1 },
              revenue: { $sum: '$price' }
            }
          },
          {
            $sort: {
              '_id.year': 1,
              '_id.month': 1
            }
          },
          {
            $project: {
              _id: 0,
              year: '$_id.year',
              month: '$_id.month',
              bookings: 1,
              revenue: 1
            }
          }
        ]).toArray();

        const totalRooms = await roomsCollections.countDocuments();
        const totalUsers = await usersCollections.countDocuments();

        const statistics = {
          totalBookings: totalStats[0]?.totalBookings || 0,
          totalRevenue: totalStats[0]?.totalRevenue || 0,
          totalRooms,
          totalUsers,
          monthlyData: monthlyData || []
        };

        res.json(statistics);
      } catch (error) {
        console.error('Admin statistics error:', error);
        res.status(500).json({
          message: 'Failed to fetch statistics',
          error: error.message
        });
      }
    });

    // Guest Statistics API 
    app.get('/guest-statistics', verifyToken, async (req, res) => {
      try {
        const userId = req.user.id;
        const userEmail = req.user.email;

        // Get guest's total bookings and spend
        const guestStats = await bookingsCollections.aggregate([
          {
            $match: {
              'guest.email': userEmail
            }
          },
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              totalSpend: { $sum: '$price' }
            }
          }
        ]).toArray();

        // Get guest's monthly data
        const monthlyData = await bookingsCollections.aggregate([
          {
            $match: {
              'guest.email': userEmail
            }
          },
          {
            $addFields: {
              parsedDate: {
                $cond: {
                  if: { $eq: [{ $type: '$date' }, 'string'] },
                  then: { $dateFromString: { dateString: '$date' } },
                  else: '$date'
                }
              }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$parsedDate' },
                month: { $month: '$parsedDate' }
              },
              bookings: { $sum: 1 },
              spend: { $sum: '$price' }
            }
          },
          {
            $sort: {
              '_id.year': 1,
              '_id.month': 1
            }
          },
          {
            $project: {
              _id: 0,
              year: '$_id.year',
              month: '$_id.month',
              bookings: 1,
              spend: 1
            }
          }
        ]).toArray();


        const user = await usersCollections.findOne({ email: userEmail });


        const favoriteDestination = await bookingsCollections.aggregate([
          {
            $match: { 'guest.email': userEmail }
          },
          {
            $group: {
              _id: '$location',
              count: { $sum: 1 }
            }
          },
          {
            $sort: { count: -1 }
          },
          {
            $limit: 1
          }
        ]).toArray();

        const statistics = {
          totalBookings: guestStats[0]?.totalBookings || 0,
          totalSpend: guestStats[0]?.totalSpend || 0,
          guestSince: user?.timestamp || null, // Use timestamp from users collection
          favoriteDestination: favoriteDestination[0]?._id || 'Not available',
          monthlyData: monthlyData || []
        };

        res.json(statistics);
      } catch (error) {
        console.error('Guest statistics error:', error);
        res.status(500).json({
          message: 'Failed to fetch guest statistics',
          error: error.message
        });
      }
    });

    // Host Statistics API 
    app.get('/host-statistics', verifyToken, verifyHost, async (req, res) => {
      try {
        const userId = req.user.id;
        const userEmail = req.user.email;

        // Get host's rooms
        const hostRooms = await roomsCollections.find({ 'host.email': userEmail }).toArray();
        const roomIds = hostRooms.map(room => room._id.toString());

        // Get host's total bookings and sales
        const hostStats = await bookingsCollections.aggregate([
          {
            $match: {
              roomId: { $in: roomIds }
            }
          },
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              totalSales: { $sum: '$price' }
            }
          }
        ]).toArray();

        // Get host's monthly data
        const monthlyData = await bookingsCollections.aggregate([
          {
            $match: {
              roomId: { $in: roomIds }
            }
          },
          {
            $addFields: {
              parsedDate: {
                $cond: {
                  if: { $eq: [{ $type: '$date' }, 'string'] },
                  then: { $dateFromString: { dateString: '$date' } },
                  else: '$date'
                }
              }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$parsedDate' },
                month: { $month: '$parsedDate' }
              },
              bookings: { $sum: 1 },
              revenue: { $sum: '$price' }
            }
          },
          {
            $sort: {
              '_id.year': 1,
              '_id.month': 1
            }
          },
          {
            $project: {
              _id: 0,
              year: '$_id.year',
              month: '$_id.month',
              bookings: 1,
              revenue: 1
            }
          }
        ]).toArray();

        // Get host since from users collection timestamp
        const user = await usersCollections.findOne({ email: userEmail });

        const statistics = {
          totalSales: hostStats[0]?.totalSales || 0,
          totalBookings: hostStats[0]?.totalBookings || 0,
          totalRooms: hostRooms.length,
          hostSince: user?.timestamp || null,
          monthlyData: monthlyData || []
        };

        res.json(statistics);
      } catch (error) {
        console.error('Host statistics error:', error);
        res.status(500).json({
          message: 'Failed to fetch host statistics',
          error: error.message
        });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from Acommo Server..')
})

app.listen(port, () => {
  console.log(`Acommo is running on port ${port}`)
})
