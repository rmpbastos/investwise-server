// // backfill_single_user_total_wealth.js
// const mongoose = require("mongoose");
// const axios = require("axios");
// require("dotenv").config();

// // MongoDB Models
// const StockPurchaseHistory = require("./models/StockPurchaseHistory");
// const Portfolio = require("./models/Portfolio");
// const TotalWealth = require("./models/TotalWealth");

// // Alpha Vantage API Key
// const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

// // User ID for backfilling (specify the user you want to backfill)
// const userId = "2Jx6QJNd8RdOPDOQyfIVgpAPO1e2";

// // Connect to MongoDB
// mongoose.connect(process.env.MONGODB_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// });

// mongoose.connection.on("connected", () => {
//   console.log("Connected to MongoDB");
// });

// mongoose.connection.on("error", (err) => {
//   console.error("MongoDB connection error:", err);
// });

// // Function to fetch historical stock price
// const fetchHistoricalPrice = async (ticker, date) => {
//   const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&apikey=${apiKey}`;
//   try {
//     const response = await axios.get(url);
//     const data = response.data;

//     if (data["Time Series (Daily)"] && data["Time Series (Daily)"][date]) {
//       const dailyData = data["Time Series (Daily)"][date];
//       const closePrice = parseFloat(dailyData["4. close"]);
//       return closePrice;
//     }
//   } catch (error) {
//     console.error(`Error fetching historical price for ${ticker} on ${date}:`, error.message);
//   }
//   return null;
// };

// // Function to backfill total wealth for the specified user
// const backfillTotalWealthForUser = async () => {
//   try {
//     console.log(`Backfilling total wealth for user: ${userId}`);

//     // Fetch all purchase records for this user
//     const purchaseHistories = await StockPurchaseHistory.find({ userId }).sort({ purchaseDate: 1 });

//     if (purchaseHistories.length === 0) {
//       console.log(`No stock purchases found for user ${userId}. Initializing TotalWealth to zero.`);
//       await TotalWealth.findOneAndUpdate(
//         { userId },
//         { totalWealth: 0, totalInvested: 0, calculationDate: new Date() },
//         { upsert: true, new: true }
//       );
//       console.log("Backfill completed with zero values.");
//       return;
//     }

//     let totalWealth = 0;
//     let totalInvested = 0;

//     // Process each purchase record
//     for (const record of purchaseHistories) {
//       const { ticker, quantity, purchasePrice, purchaseDate, brokerageFees } = record;
//       const formattedDate = new Date(purchaseDate).toISOString().split("T")[0];

//       // Fetch the historical closing price for the purchase date
//       const closePrice = await fetchHistoricalPrice(ticker, formattedDate);

//       if (closePrice !== null) {
//         const stockValue = closePrice * quantity;
//         totalWealth += stockValue;
//         totalInvested += (quantity * purchasePrice) + brokerageFees;

//         console.log(`Date: ${formattedDate}, Ticker: ${ticker}, Close Price: ${closePrice}, Stock Value: ${stockValue}`);

//         // Create backfill data for this purchase date
//         const backfillData = {
//           userId,
//           totalWealth,
//           totalInvested,
//           calculationDate: new Date(purchaseDate), // Use the purchase date here
//         };

//         // Insert or update backfilled data in the TotalWealth collection
//         await TotalWealth.findOneAndUpdate(
//           { userId, calculationDate: backfillData.calculationDate },
//           backfillData,
//           { upsert: true, new: true }
//         );
//       }
//     }

//     console.log(`Backfilled total wealth for user: ${userId}`);
//     mongoose.connection.close();
//   } catch (error) {
//     console.error("Error during backfilling process:", error);
//     mongoose.connection.close();
//   }
// };

// // Execute the backfill function
// backfillTotalWealthForUser();
