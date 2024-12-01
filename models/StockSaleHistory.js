const mongoose = require('mongoose');

const StockSaleSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  ticker: { type: String, required: true },
  sellDate: { type: Date, required: true },
  quantitySold: { type: Number, required: true },
  sellingPrice: { type: Number, required: true },
  brokerageFees: { type: Number, required: true },
  totalSaleValue: { type: Number, required: true },
}, { timestamps: true });

const StockSaleHistory = mongoose.model('StockSaleHistory', StockSaleSchema);
module.exports = StockSaleHistory;
