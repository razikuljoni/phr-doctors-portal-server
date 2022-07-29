const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const port = process.env.PORT || 8000;

const app = express();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://admin:admin@cluster0.ktfxl.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});
async function run() {
    try {
        // await client.connect();
        const serviceCollection = client
            .db("doctors-portal-2022")
            .collection("service");
        const bookingCollection = client
            .db("doctors-portal-2022")
            .collection("bookings");
        console.log("DB Connected");

        //Get all services
        app.get("/service", async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

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
        app.get("/booking", async (req, res) => {
            const patientEmail = req.query.patientEmail;
            const query = {patientEmail};
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
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
