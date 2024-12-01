const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const Portfolio = require('./models/Portfolio');
const DailyStockPrice = require('./models/DailyStockPrice');
const UserProfile = require('./models/UserProfile');
const TotalWealth = require('./models/TotalWealth');
const StockPurchaseHistory = require('./models/StockPurchaseHistory');
const StockSaleHistory = require('./models/StockSaleHistory');


require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error('MongoDB connection error:', err));


// Route to search for stocks using Tiingo Search API
// https://www.tiingo.com/documentation/utilities/search
app.get('/api/search/:query', async (req, res) => {
    const query = req.params.query;
    const apiKey = process.env.TIINGO_API_KEY;

    try {
        const response = await axios.get(`https://api.tiingo.com/tiingo/utilities/search?query=${query}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiKey}`
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Error searching for stock data' });
    }
});


app.get('/api/portfolio/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        const portfolio = await Portfolio.findOne({ userId });
        if (!portfolio) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }
        res.json(portfolio.stocks); // Return all stock data
    } catch (error) {
        res.status(500).json({ error: 'Error fetching portfolio data' });
    }
});


// Route to aggregate stock data by ticker
app.get('/api/portfolio/aggregate/:userId', async (req, res) => {
    const userId = req.params.userId;
  
    try {
      const portfolio = await Portfolio.findOne({ userId });
      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }
  
      // Grouping stocks by ticker
      const aggregatedStocks = portfolio.stocks.reduce((acc, stock) => {
        const { ticker, name, assetType, quantity, purchasePrice, brokerageFees } = stock;
  
        if (!acc[ticker]) {
          acc[ticker] = {
            ticker,
            name,
            assetType,
            totalQuantity: 0,
            totalCost: 0,
          };
        }
  
        // Accumulate total quantity and cost
        acc[ticker].totalQuantity += quantity;
        acc[ticker].totalCost += (quantity * purchasePrice) + brokerageFees;
  
        return acc;
      }, {});
  
      // Calculate average purchase price as total cost divided by total quantity
      const result = Object.values(aggregatedStocks).map(stock => ({
        ticker: stock.ticker,
        name: stock.name,
        assetType: stock.assetType,
        totalQuantity: stock.totalQuantity,
        averagePurchasePrice: stock.totalCost / stock.totalQuantity,
        totalCost: stock.totalCost,
      }));
  
      res.json(result);
    } catch (error) {
      console.error('Error aggregating stock data:', error);
      res.status(500).json({ error: 'Error aggregating stock data' });
    }
  });




// Route to add stock details
app.post('/api/portfolio/addDetails', async (req, res) => {
  const { userId, stock } = req.body;

  try {
    // Convert input values to numbers
    const quantity = parseFloat(stock.quantity);
    const purchasePrice = parseFloat(stock.purchasePrice);
    const brokerageFees = parseFloat(stock.brokerageFees);

    // Calculate total cost as a number
    const totalCost = parseFloat(((quantity * purchasePrice) + brokerageFees).toFixed(2));

    // Validate the total cost
    if (isNaN(totalCost)) {
      throw new Error(`Invalid totalCost value: ${totalCost}`);
    }

    // Add to Portfolio
    let portfolio = await Portfolio.findOne({ userId });
    if (!portfolio) {
      portfolio = new Portfolio({ userId, stocks: [stock] });
    } else {
      portfolio.stocks.push(stock);
    }
    await portfolio.save();

    // Add to StockPurchaseHistory
    const purchaseRecord = new StockPurchaseHistory({
      userId,
      ticker: stock.ticker,
      name: stock.name,
      purchaseDate: stock.purchaseDate,
      quantity,
      purchasePrice,
      brokerageFees,
      totalCost,
    });
    await purchaseRecord.save();

    res.json({ message: 'Stock details added to portfolio and purchase history saved' });
  } catch (error) {
    console.error('Error adding stock details to portfolio:', error);
    res.status(500).json({ error: 'Error adding stock details to portfolio' });
  }
});


// Route to fetch the latest stock prices
app.get('/api/stock/latest/:ticker', async (req, res) => {
  const ticker = req.params.ticker;
  const apiKey = process.env.TIINGO_API_KEY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);  // Set to start of today

  try {
      // Check if we have today's data cached in the database
      let dailyPrice = await DailyStockPrice.findOne({ ticker, date: today });

      if (dailyPrice) {
          // If data exists for today, return it from the cache
          return res.json({
              open: dailyPrice.open,
              close: dailyPrice.close
          });
      }

      // If no data exists for today, make an API call to Tiingo
      const response = await axios.get(`https://api.tiingo.com/tiingo/daily/${ticker}/prices`, {
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Token ${apiKey}`
          }
      });

      if (response.data && response.data.length > 0) {
          const latestData = response.data[0];  // Take the most recent price data
          const { open, close } = latestData;

          // Save the data to the cache
          dailyPrice = new DailyStockPrice({
              ticker,
              open,
              close,
              date: today  // new Date()????
          });
          await dailyPrice.save();

          // Return the fetched data
          return res.json({ open, close });
      } else {
          return res.status(404).json({ error: 'No data found for this ticker' });
      }
  } catch (error) {
      console.error(`Error fetching latest price for ${ticker}:`, error);
      res.status(500).json({ error: 'Error fetching latest price' });
  }
});


app.post('/api/user-profile/create', async (req, res) => {
  const { userId, email } = req.body;

  try {
    // Check if a profile already exists for the user
    const existingProfile = await UserProfile.findOne({ userId });
    if (existingProfile) {
      return res.status(200).json({ message: 'User profile already exists', userProfile: existingProfile });
    }

    // Create a new user profile if it doesn't exist
    const newUserProfile = new UserProfile({
      userId,
      email,
      firstName: '',
      lastName: '',
      phone: '',
      address: ''
    });

    // Save the new user profile
    await newUserProfile.save();

    // Also create an empty portfolio for the user
    const newPortfolio = new Portfolio({ userId, stocks: [] });
    await newPortfolio.save();

    return res.status(201).json({ message: 'User profile and empty portfolio created successfully', userProfile: newUserProfile });
  } catch (error) {
    console.error('Error creating user profile or portfolio:', error);
    return res.status(500).json({ error: 'Error creating user profile or portfolio' });
  }
});


// Route to calculate and save user total wealth
app.post('/api/total-wealth/update', async (req, res) => {
  const { userId } = req.body;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  try {
    const portfolio = await Portfolio.findOne({ userId });

    if (!portfolio || portfolio.stocks.length === 0) {
      return res.status(200).json({ totalWealth: 0, totalInvested: 0 });
    }

    let totalWealth = 0;
    let totalInvested = 0;

    for (const stock of portfolio.stocks) {
      const { ticker, quantity, purchasePrice, brokerageFees } = stock;

      // Attempt to fetch intraday data for real-time price
      const intradayUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${ticker}&interval=5min&apikey=${apiKey}`;

      let currentPrice = null;

      try {
        console.log(`Wealth: Fetching intraday price data for ${ticker}...`);
        const intradayResponse = await axios.get(intradayUrl);

        if (intradayResponse.headers['content-type'].includes('application/json')) {
          const intradayData = intradayResponse.data;
          const timeSeries = intradayData["Time Series (5min)"];

          if (timeSeries) {
            const latestTimestamp = Object.keys(timeSeries)[0];
            const latestIntradayData = timeSeries[latestTimestamp];
            currentPrice = parseFloat(latestIntradayData["4. close"]);
          }
        }
      } catch (error) {
        console.error(`Error fetching intraday price for ${ticker}:`, error.message);
      }

      // If intraday data is not available, fallback to daily adjusted data
      if (!currentPrice) {
        const dailyUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&apikey=${apiKey}`;

        try {
          console.log(`Fetching daily adjusted price data for ${ticker}...`);
          const dailyResponse = await axios.get(dailyUrl);

          if (dailyResponse.headers['content-type'].includes('application/json')) {
            const dailyData = dailyResponse.data;
            if (dailyData["Time Series (Daily)"]) {
              const latestDate = Object.keys(dailyData["Time Series (Daily)"])[0];
              const latestDailyData = dailyData["Time Series (Daily)"][latestDate];
              currentPrice = parseFloat(latestDailyData["4. close"]);
            }
          }
        } catch (error) {
          console.error(`Error fetching daily adjusted price for ${ticker}:`, error.message);
        }
      }

      // If a valid current price was fetched, update total wealth
      if (!isNaN(currentPrice)) {
        totalWealth += currentPrice * quantity;
      }

      // Calculate total invested amount
      totalInvested += (quantity * purchasePrice) + brokerageFees;
    }

    // Add a new entry for the total wealth in the database
    const userWealth = new TotalWealth({
      userId,
      totalWealth,
      totalInvested,
      calculationDate: new Date(),
    });

    await userWealth.save();

    res.status(200).json({ totalWealth: userWealth.totalWealth, totalInvested: userWealth.totalInvested });
  } catch (error) {
    console.error('Error updating total wealth:', error);
    res.status(500).json({ error: 'Error updating total wealth' });
  }
});


// Route to fetch the latest total wealth for a user
app.get('/api/total-wealth/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch the latest total wealth data without creating a new entry
    const latestWealth = await TotalWealth.findOne({ userId }).sort({ calculationDate: -1 });

    if (!latestWealth) {
      console.log(`No wealth data found for userId: ${userId}.`);
      return res.status(404).json({ error: 'No wealth data found for this user.' });
    }

    res.status(200).json({
      totalWealth: latestWealth.totalWealth,
      totalInvested: latestWealth.totalInvested,
    });
  } catch (error) {
    console.error('Error fetching total wealth:', error);
    res.status(500).json({ error: 'Error fetching total wealth' });
  }
});


// Route to create initial TotalWealth entry for a new user
app.post('/api/total-wealth/create', async (req, res) => {
  const { userId } = req.body;

  try {
    // Check if a TotalWealth entry already exists for the user
    const existingWealth = await TotalWealth.findOne({ userId });
    if (existingWealth) {
      return res.status(200).json({ message: 'TotalWealth entry already exists' });
    }

    // Create a new TotalWealth entry with default values
    const newWealth = new TotalWealth({
      userId,
      totalWealth: 0,
      totalInvested: 0,
      calculationDate: new Date()
    });

    await newWealth.save();
    res.status(201).json({ message: 'Initial TotalWealth entry created successfully' });
  } catch (error) {
    console.error('Error creating initial TotalWealth entry:', error);
    res.status(500).json({ error: 'Error creating initial TotalWealth entry' });
  }
});


// Route to Fetch Sentiment Data
app.post('/api/stock/sentiment/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required.' });
  }

  const sentimentUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${ticker}&apikey=${apiKey}`;

  try {
    console.log(`Fetching sentiment data for ${ticker}...`);
    const response = await axios.get(sentimentUrl);

    if (response.headers['content-type'].includes('application/json')) {
      const data = response.data;

      if (data.feed && data.feed.length > 0) {
        // Get overall sentiment score
        const latestArticle = data.feed[0];
        const overallSentimentScore = parseFloat(latestArticle.overall_sentiment_score) || 0;

        // Find the specific sentiment data for the requested ticker
        const tickerSentimentData = latestArticle.ticker_sentiment?.find(
          (sentiment) => sentiment.ticker === ticker.toUpperCase()
        );

        const tickerSentimentScore =
          tickerSentimentData && tickerSentimentData.ticker_sentiment_score
            ? parseFloat(tickerSentimentData.ticker_sentiment_score)
            : 0;

        return res.json({
          overallSentimentScore,
          tickerSentimentScore,
        });
      } else {
        return res.status(404).json({ error: 'No sentiment data found for this ticker.' });
      }
    } else {
      return res.status(500).json({ error: 'Invalid response from API.' });
    }
  } catch (error) {
    console.error(`Error fetching sentiment data for ${ticker}:`, error);
    res.status(500).json({ error: 'Error fetching sentiment data.' });
  }
});


// Route to Fetch Price Data for the ML model
app.post('/api/stock/latest/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required.' });
  }

  const priceUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&apikey=${apiKey}`;

  try {
    console.log(`Fetching price data for ${ticker}...`);
    const response = await axios.get(priceUrl);

    if (response.headers['content-type'].includes('application/json')) {
      const data = response.data;
      if (data["Time Series (Daily)"]) {
        const latestDate = Object.keys(data["Time Series (Daily)"])[0];
        const latestData = data["Time Series (Daily)"][latestDate];

        const priceData = {
          open: parseFloat(latestData["1. open"]),
          high: parseFloat(latestData["2. high"]),
          low: parseFloat(latestData["3. low"]),
          close: parseFloat(latestData["4. close"]),
          adjusted_close: parseFloat(latestData["5. adjusted close"]),
          volume: parseInt(latestData["6. volume"]),
          dividend_amount: parseFloat(latestData["7. dividend amount"]),
          split_coefficient: parseFloat(latestData["8. split coefficient"]),
        };

        return res.json(priceData);
      } else {
        return res.status(404).json({ error: 'No price data found for this ticker.' });
      }
    } else {
      return res.status(500).json({ error: 'Invalid response from API.' });
    }
  } catch (error) {
    console.error(`Error fetching price data for ${ticker}:`, error);
    res.status(500).json({ error: 'Error fetching price data.' });
  }
});


// Route to Fetch Intraday Price Data (most up-to-date)
app.post('/api/stock/intraday/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  const intradayUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${ticker}&interval=5min&apikey=${apiKey}&outputsize=compact`;

  try {
    console.log(`Fetching intraday price data for ${ticker}...`);
    const response = await axios.get(intradayUrl);

    if (response.headers['content-type'].includes('application/json')) {
      const data = response.data;
      const timeSeries = data["Time Series (5min)"];
      if (timeSeries) {
        const latestTimestamp = Object.keys(timeSeries)[0];
        const latestData = timeSeries[latestTimestamp];

        const intradayPriceData = {
          open: parseFloat(latestData["1. open"]),
          high: parseFloat(latestData["2. high"]),
          low: parseFloat(latestData["3. low"]),
          close: parseFloat(latestData["4. close"]),
          volume: parseInt(latestData["5. volume"]),
        };

        return res.json(intradayPriceData);
      } else {
        return res.status(404).json({ error: 'No intraday data found for this ticker.' });
      }
    } else {
      return res.status(500).json({ error: 'Invalid response from API.' });
    }
  } catch (error) {
    console.error(`Error fetching intraday data for ${ticker}:`, error);
    res.status(500).json({ error: 'Error fetching intraday price data.' });
  }
});


// Route to get the latest total wealth entry for each month (for the area chart)
app.get('/api/total-wealth/history/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const currentDate = new Date();
    const oneYearAgo = new Date(currentDate);
    oneYearAgo.setMonth(currentDate.getMonth() - 12);

    // Aggregate data to get the latest entry for each month
    const wealthHistory = await TotalWealth.aggregate([
      {
        $match: {
          userId,
          calculationDate: { $gte: oneYearAgo },
        },
      },
      {
        $sort: {
          calculationDate: 1, // Sort by date in ascending order
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$calculationDate" },
            month: { $month: "$calculationDate" },
          },
          totalWealth: { $last: "$totalWealth" },
          totalInvested: { $last: "$totalInvested" },
          calculationDate: { $last: "$calculationDate" },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
        },
      },
    ]);

    // Format the response data
    const responseData = wealthHistory.map((entry) => ({
      calculationDate: entry.calculationDate,
      totalWealth: entry.totalWealth,
      totalInvested: entry.totalInvested,
    }));

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching total wealth history:', error);
    res.status(500).json({ error: 'Error fetching total wealth history' });
  }
});


// Fetch Historical Price Data (To send data for prediction)
app.post('/api/fetch-price-data', async (req, res) => {
  const { ticker } = req.body;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker is required.' });
  }

  try {
    // Fetch historical price data
    const response = await axios.get(
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&apikey=${apiKey}&outputsize=full`
    );

    if (response.data['Time Series (Daily)']) {
      const historicalData = Object.entries(response.data['Time Series (Daily)']).map(
        ([date, data]) => ({
          date,
          open: parseFloat(data['1. open']),
          high: parseFloat(data['2. high']),
          low: parseFloat(data['3. low']),
          close: parseFloat(data['4. close']),
          adjusted_close: parseFloat(data['5. adjusted close']),
          volume: parseInt(data['6. volume'], 10),
          dividend_amount: parseFloat(data['7. dividend amount']),
          split_coefficient: parseFloat(data['8. split coefficient']),
        })
      );

      return res.status(200).json(historicalData);
    } else {
      return res.status(404).json({ error: 'No historical data found.' });
    }
  } catch (error) {
    console.error('Error fetching historical data:', error.message);
    return res.status(500).json({ error: 'Failed to fetch historical data.' });
  }
});


// Route to handle stock sale
app.post("/api/portfolio/sell", async (req, res) => {
  const { userId, ticker, sellDate, quantitySold, sellPrice, brokerageFees } = req.body;

  try {
    // Log received data for debugging
    console.log("Received data:", { userId, ticker, sellDate, quantitySold, sellPrice, brokerageFees });

    // Fetch the user's portfolio
    console.log("Querying Portfolio for userId:", userId);
    const portfolio = await Portfolio.findOne({ userId });
    console.log("Matching portfolio:", portfolio);

    if (!portfolio) {
      console.error("Portfolio not found for userId:", userId);
      return res.status(404).json({ error: "Portfolio not found" });
    }

    // Find the stock in the portfolio
    console.log("Searching for ticker:", ticker);
    const stockIndex = portfolio.stocks.findIndex((s) => s.ticker === ticker);

    if (stockIndex === -1) {
      console.error("Stock not found in portfolio for ticker:", ticker);
      return res.status(404).json({ error: "Stock not found in portfolio" });
    }

    const stock = portfolio.stocks[stockIndex];

    // Validate that the user is not selling more shares than they own
    if (quantitySold > stock.quantity) {
      console.error("Attempt to sell more shares than owned for ticker:", ticker);
      return res.status(400).json({ error: "Cannot sell more shares than owned" });
    }

    // Calculate the total sale value
    const totalSaleValue = quantitySold * sellPrice - brokerageFees;

    // Update the stock's quantity
    stock.quantity -= quantitySold;

    // If the stock's quantity becomes zero, remove it from the portfolio
    if (stock.quantity === 0) {
      console.log("Removing stock with ticker:", ticker);
      portfolio.stocks.splice(stockIndex, 1);
    }

    // Save the updated portfolio
    console.log("Saving updated portfolio...");
    await portfolio.save();

    // Record the sale in StockSaleHistory
    const saleRecord = new StockSaleHistory({
      userId,
      ticker,
      sellDate,
      quantitySold,
      sellingPrice: sellPrice,
      brokerageFees,
      totalSaleValue,
    });

    console.log("Saving stock sale history...");
    await saleRecord.save();

    // Update TotalWealth after the sale
    try {
      console.log("Updating total wealth for userId:", userId);
      const updateResponse = await axios.post("http://localhost:5000/api/total-wealth/update", { userId });
      console.log("Total wealth updated:", updateResponse.data);
    } catch (updateError) {
      console.error("Error updating total wealth:", updateError.message);
    }

    // Respond with success message
    res.json({ message: "Stock sale recorded and portfolio updated successfully" });
  } catch (error) {
    console.error("Error handling stock sale:", error);
    res.status(500).json({ error: "Error handling stock sale" });
  }
});


// ******************** FLASK API PREDICTION ********************
// Route to forward prediction requests to Flask
// app.post('/api/predict', async (req, res) => {
//   try {
//     // Forward the request body directly to the Flask API
//     const flaskResponse = await axios.post('http://127.0.0.1:5001/predict', req.body);

//     // Send the Flask response back to the frontend
//     res.status(200).json(flaskResponse.data);
//   } catch (error) {
//     console.error('Error communicating with Flask API:', error.message);

//     // Send a detailed error response
//     res.status(500).json({
//       error: 'Error communicating with Flask API',
//       message: error.message,
//       stack: error.stack || null,
//     });
//   }
// });


// Working (with logs)
app.post('/api/predict', async (req, res) => {
  try {
      console.log("Received payload for prediction:", req.body);

      // Forward the request to the Flask API
      // const flaskResponse = await axios.post('http://127.0.0.1:5001/predict', req.body);

      // Deployment
      const flaskResponse = await axios.post('https://investwise-flask.onrender.com/predict', req.body);

      console.log("Prediction result from Flask API:", flaskResponse.data);

      // Send the Flask response back to the frontend
      res.status(200).json(flaskResponse.data);
  } catch (error) {
      console.error("Error communicating with Flask API:", error.message);
      res.status(500).json({
          error: "Error communicating with Flask API",
          message: error.message,
          stack: error.stack || null,
      });
  }
});


// Route to fetch news sentiment for multiple tickers
app.post('/api/news-sentiment', async (req, res) => {
  const { tickers } = req.body; // Array of tickers
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!tickers || tickers.length === 0) {
    return res.status(400).json({ error: 'No tickers provided.' });
  }

  try {
    const allNewsByTicker = {};

    // Fetch news for each ticker
    for (const ticker of tickers) {
      const response = await axios.get(
        `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${ticker}&apikey=${apiKey}`
      );

      if (response.data?.feed) {
        // Extract and clean relevant news articles
        const news = response.data.feed.map((article) => ({
          title: article.title,
          url: article.url,
          summary: article.summary,
          sentiment_label: article.overall_sentiment_label,
          sentiment_score: article.overall_sentiment_score,
          ticker_sentiments: article.ticker_sentiment.filter((t) => t.ticker === ticker),
          published_date: article.time_published,
        }));

        // Add news to the specific ticker in the object
        allNewsByTicker[ticker] = news;
      }
    }

    res.status(200).json(allNewsByTicker);
  } catch (error) {
    console.error('Error fetching news sentiment:', error);
    res.status(500).json({ error: 'Error fetching news sentiment data.' });
  }
});


// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});