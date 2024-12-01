const mongoose = require('mongoose');

const PortfolioSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  stocks: [
    {
      ticker: String,
      name: String,
      assetType: String,
      purchaseDate: Date,
      quantity: Number,
      purchasePrice: Number,
      brokerageFees: Number,
      addedAt: { type: Date, default: Date.now },
      purchaseLots: [
        {
          purchaseDate: Date,
          quantity: Number,
          purchasePrice: Number,
          brokerageFees: Number,
        },
      ],
    },
  ],
});

module.exports = mongoose.model('Portfolio', PortfolioSchema);
