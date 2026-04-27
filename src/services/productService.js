const Product = require('../models/Product');
const logger = require('../utils/logger');

// Hardcoded tax rate for demonstration (15%)
const TAX_RATE = 0.15;

/**
 * Adapter function to transform legacy schema records to current version.
 * Logs when outdated schemas are encountered.
 */
const adaptSchema = (product) => {
  let adapted = { ...product };
  
  if (adapted.schemaVersion !== 1) {
    logger.warn('Outdated schemaVersion detected for product', { productId: adapted.id, schemaVersion: adapted.schemaVersion });
    // Perform any necessary adaptation here
    // For now, simply update the version to 1 in the response
    adapted.schemaVersion = 1;
  }
  
  return adapted;
};

/**
 * Retrieves products with inventory integrated via Aggregation Pipeline.
 * Avoids N+1 query problems.
 */
const getProductsList = async ({ page = 1, limit = 10, category, lang = 'en', currency = 'USD' }) => {
  const startTime = Date.now();
  const safePage = Number(page) > 0 ? Math.floor(Number(page)) : 1;
  const safeLimit = Number(limit) > 0 ? Math.floor(Number(limit)) : 10;
  const skip = (safePage - 1) * safeLimit;

  // Build match stage
  const matchStage = { isDeleted: false };
  if (category) {
    matchStage.category = category;
  }

  // Language fallback logic for title and description
  // If requested language is null/missing, fallback to 'ar'
  const titlePath = `$title.${lang}`;
  const descPath = `$description.${lang}`;

  const pipeline = [
    { $match: matchStage },
    
    // Lookup inventory
    {
      $lookup: {
        from: 'inventories', // Mongo collection names are lowercase and plural by default
        localField: '_id',
        foreignField: 'productId',
        as: 'inventoryData'
      }
    },
    
    // Unwind inventory (1:1 relation)
    {
      $unwind: {
        path: '$inventoryData',
        preserveNullAndEmptyArrays: true
      }
    },

    // Projection & transformations
    {
      $project: {
        id: '$_id',
        _id: 0,
        name: { $ifNull: [titlePath, '$title.ar'] },
        description: { $ifNull: [descPath, '$description.ar'] },
        category: 1,
        images: 1,
        schemaVersion: 1,
        
        // Convert Decimal128 to double for JSON response
        basePrice: { $toDouble: '$basePrice' },
        
        // Calculate tax. If there's a discount, apply it here too.
        // calculatedPrice = basePrice * (1 + TAX_RATE)
        calculatedPrice: {
          $multiply: [{ $toDouble: '$basePrice' }, (1 + TAX_RATE)]
        },
        
        currency: { $ifNull: ['$currency', currency] },
        
        // Sum availableQuantity across all locations
        totalAvailable: {
          $reduce: {
            input: { $ifNull: ['$inventoryData.locations', []] },
            initialValue: 0,
            in: { $add: ['$$value', '$$this.availableQuantity'] }
          }
        },
        
        // Pass location details
        locations: {
          $map: {
            input: { $ifNull: ['$inventoryData.locations', []] },
            as: 'loc',
            in: {
              warehouse: '$$loc.locationName',
              quantity: '$$loc.availableQuantity'
            }
          }
        }
      }
    },
    
    // Add Availability field based on totalAvailable
    {
      $addFields: {
        availability: {
          $cond: {
            if: { $gt: ['$totalAvailable', 0] },
            then: 'In Stock',
            else: 'Out of Stock'
          }
        }
      }
    },

    // Sorting and Pagination
    { $sort: { id: 1 } },
    { $skip: skip },
    { $limit: limit }
  ];

  // Execute aggregation
  const productsRaw = await Product.aggregate(pipeline).exec();
  
  // Apply schema adapter
  const products = productsRaw.map(adaptSchema);
  
  // Count total for pagination
  // This is a separate fast query on just Products
  const total = await Product.countDocuments(matchStage);

  const durationMs = Date.now() - startTime;
  logger.slowQuery('getProductsList', durationMs, { page, limit, category, lang });

  return { products, total, durationMs };
};

module.exports = {
  getProductsList
};
