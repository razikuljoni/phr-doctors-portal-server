const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 5000;

const app = express();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ktfxl.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "UnAuthorized Access" });
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "Forbidden Access" });
        }
        req.decoded = decoded;
        next();
    });
};

async function run() {
    try {
        // await client.connect();
        const serviceCollection = client
            .db("doctors-portal-2022")
            .collection("service");
        const bookingCollection = client
            .db("doctors-portal-2022")
            .collection("bookings");
        const userCollection = client
            .db("doctors-portal-2022")
            .collection("users");
        const doctorCollection = client
            .db("doctors-portal-2022")
            .collection("doctors");
        console.log("DB Connected");

        //verify admin or not
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({
                email: requester,
            });
            if (requesterAccount.role === "Admin") {
                next();
            } else {
                return res.status(403).send({ message: "Forbidden Access" });
            }
        };

        //Get all services
        app.get("/service", async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        });

        //get all users
        app.get("/user", verifyJWT, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        //find admin or not
        app.get("/admin/:email", async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email });
            const isAdmin = user.role === "Admin";
            res.send({ admin: isAdmin });
        });

        //make admin / user
        app.put(
            "/user/admin/:email",
            verifyJWT,
            verifyAdmin,
            async (req, res) => {
                const email = req.params.email;
                const filter = { email };
                const exists = await userCollection.findOne(filter);
                if (exists?.role === "User") {
                    const updatedDoc = {
                        $set: { role: "Admin" },
                    };
                    const result = await userCollection.updateOne(
                        filter,
                        updatedDoc
                    );
                    res.send(result);
                } else if (exists?.role === "Admin") {
                    const updatedDoc = {
                        $set: { role: "User" },
                    };
                    const result = await userCollection.updateOne(
                        filter,
                        updatedDoc
                    );
                    res.send(result);
                }
            }
        );

        //update a user
        app.put("/user/:email", async (req, res) => {
            const email = req.params.email;
            const oldUser = await userCollection.findOne({ email });
            const user = req.body;
            console.log({ ...user });
            const filter = { email };
            const options = { upsert: true };

            if (oldUser?.role) {
                const updatedDoc = {
                    $set: { ...user, role: oldUser?.role },
                };
                const result = await userCollection.updateOne(
                    filter,
                    updatedDoc,
                    options
                );
                const token = jwt.sign(
                    { email },
                    process.env.ACCESS_TOKEN_SECRET,
                    {
                        expiresIn: "30d",
                    }
                );
                res.send({ result, token });
            } else {
                const updatedDoc = {
                    $set: { ...user, role: "User" },
                };
                const result = await userCollection.updateOne(
                    filter,
                    updatedDoc,
                    options
                );
                const token = jwt.sign(
                    { email },
                    process.env.ACCESS_TOKEN_SECRET,
                    {
                        expiresIn: "30d",
                    }
                );
                res.send({ result, token });
            }
        });

        //delete a user
        app.delete(
            "/user/admin/:email",
            verifyJWT,
            verifyAdmin,
            async (req, res) => {
                const email = req.params.email;
                const filter = { email };
                const result = await userCollection.deleteOne(filter);
                res.send(result);
            }
        );

        //get available slots
        app.get("/available", async (req, res) => {
            const date = req.query.date;

            //get all services
            const services = await serviceCollection.find().toArray();
            //get all the bookings of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();
            //for each service find bookings for that service
            services.forEach((service) => {
                //find the bookings for that service
                const serviceBookings = bookings.filter(
                    (b) => b.treatmentName === service.name
                );
                //select slots for service Bookings
                const booked = serviceBookings.map((s) => s.slot);
                //select those that are not in booked slots
                const available = service?.slots?.filter(
                    (s) => !booked.includes(s)
                );
                service.slots = available;
                // service.booked = booked;
            });
            res.send(services);
        });

        //get all bookings of an user
        app.get("/booking", verifyJWT, async (req, res) => {
            const patientEmail = req?.query?.patientEmail;
            const decodedEmail = req?.decoded?.email;
            if (patientEmail) {
                const query = { patientEmail };
                const bookings = await bookingCollection.find(query).toArray();
                res.send(bookings);
            } else {
                return res.status(403).send({ message: "Forbidden Access" });
            }
        });

        //Add a new booking
        app.post("/booking", async (req, res) => {
            const booking = req.body;
            const query = {
                treatmentName: booking.treatmentName,
                date: booking.date,
                patientEmail: booking.patientEmail,
            };
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists });
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({ success: true, result });
        });

        //get all doctors
        app.get("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        });

        //add a new doctor
        app.post("/doctor", verifyJWT, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        });

        //delete a doctor
        app.delete(
            "/doctor/:email",
            verifyJWT,
            verifyAdmin,
            async (req, res) => {
                const email = req.params.email;
                const filter = { email };
                const result = await doctorCollection.deleteOne(filter);
                res.send(result);
            }
        );
    } finally {
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Doctors Portal Running");
});

app.listen(port, () => {
    console.log(`Listening to port ${port}`);
});
