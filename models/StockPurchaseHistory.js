const mongoose = require('mongoose');

const StockPurchaseSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  ticker: { type: String, required: true },
  name: { type: String, required: true },
  purchaseDate: { type: Date, required: true },
  quantity: { type: Number, required: true },
  purchasePrice: { type: Number, required: true },
  brokerageFees: { type: Number, required: true },
  totalCost: { type: Number, required: true },
}, { timestamps: true });

const StockPurchaseHistory = mongoose.model('StockPurchaseHistory', StockPurchaseSchema);
module.exports = StockPurchaseHistory;
