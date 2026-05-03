/**
 * ============================================================================
 * COMPREHENSIVE API TEST SUITE - E-commerce_API Backend
 * ============================================================================
 * 
 * This test suite covers all endpoints in the E-commerce_API application.
 * 
 * Requirements:
 * - npm install axios
 * - npm install http-cookie-agent tough-cookie
 * - MongoDB running
 * - Application running (npm start)
 * 
 * Usage:
 * - node API_TESTS.js
 * 
 * ============================================================================
 */

const axios = require('axios');
const { HttpCookieAgent, HttpsCookieAgent } = require('http-cookie-agent/http');
const { CookieJar } = require('tough-cookie');

// Create a cookie jar to persist cookies across requests
const cookieJar = new CookieJar();

// Create axios instance with proper cookie handling
const axiosInstance = axios.create({
  httpAgent: new HttpCookieAgent({ cookies: { jar: cookieJar } }),
  httpsAgent: new HttpsCookieAgent({ cookies: { jar: cookieJar } }),
  validateStatus: () => true
});

// Configuration
const BASE_URL = 'http://localhost:5000';
const DEFAULT_ADMIN_EMAIL = 'admin@store.com';
const DEFAULT_ADMIN_PASSWORD = 'Admin@12345';

// Test Statistics
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  issues: []
};

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test result helper
function logTest(name, passed, details = '') {
  stats.total++;
  if (passed) {
    stats.passed++;
    console.log(`${colors.green}✓${colors.reset} ${name}`);
  } else {
    stats.failed++;
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    if (details) console.log(`  ${colors.yellow}${details}${colors.reset}`);
    stats.issues.push({ test: name, details });
  }
}

// HTTP request helper with cookie support
async function makeRequest(method, path, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${path}`,
      withCredentials: true,
      validateStatus: () => true
    };

    if (data) {
      config.data = data;
    }

    const response = await axiosInstance(config);
    return response;
  } catch (error) {
    console.error('Request error:', error.message);
    throw error;
  }
}

// ============================================================================
// 🌱 DATA SEEDING FUNCTION (Fix #2)
// ============================================================================
/**
 * Seeds test data to ensure Order and Review tests have data to work with.
 * This solves the "No order ID available" / "No review ID available" errors.
 */
async function seedTestData() {
  console.log(`\n${colors.yellow}🌱 Seeding test data...${colors.reset}\n`);
  
  try {
    // Step 1: Create a test product with inventory
    console.log('  1. Creating test product...');
    const productResponse = await makeRequest('POST', '/api/admin/products', {
      title: { ar: 'منتج بيانات الاختبار', en: 'Test Seed Product' },
      description: { ar: 'منتج للاختبار', en: 'Product for testing' },
      category: 'Test',
      basePrice: '99.99',
      currency: 'USD',
      images: ['https://example.com/image.jpg'],
      specifications: [{ key: 'test', value: 'true' }]
    });
    
    if (productResponse.status !== 201) {
      console.log(`  ❌ Failed to create product: ${productResponse.status}`);
      return null;
    }
    
    const seedProductId = productResponse.data.data?.productId || productResponse.data.data?._id;
    console.log(`  ✓ Product created: ${seedProductId}`);
    
    // Step 2: Add stock to inventory
    console.log('  2. Adding inventory...');
    const inventoryResponse = await makeRequest('PATCH', `/api/admin/inventory/${seedProductId}`, {
      delta: 50,
      locationName: 'المستودع الرئيسي'
    });
    console.log(`  ✓ Inventory updated: ${inventoryResponse.status}`);
    
    // Step 3: Create a test user and checkout (to create order + review)
    console.log('  3. Creating test order via checkout...');
    const userEmail = `testorder_${Date.now()}@test.com`;
    
    // Register new user
    const regResponse = await makeRequest('POST', '/api/auth/register', {
      name: 'Test Order User',
      email: userEmail,
      password: 'TestOrder@1234'
    });
    
    if (regResponse.status !== 201) {
      console.log(`  ❌ Failed to register user: ${regResponse.status}`);
      return null;
    }
    
    // Login as new user
    await makeRequest('POST', '/api/auth/login', {
      email: userEmail,
      password: 'TestOrder@1234'
    });
    
    // Create order via checkout
    const checkoutResponse = await makeRequest('POST', '/api/v1/checkout/order', {
      items: [
        {
          productId: seedProductId,
          quantity: 2
        }
      ],
      shippingAddress: {
        street: '123 Test St',
        city: 'Test City',
        state: 'Test',
        zip: '12345',
        country: 'Test Country'
      }
    });
    
    if (checkoutResponse.status !== 201) {
      console.log(`  ❌ Failed to create order: ${checkoutResponse.status}`);
      return null;
    }
    
    const seedOrderId = checkoutResponse.data.data?.orderId || checkoutResponse.data.data?._id;
    console.log(`  ✓ Order created: ${seedOrderId}`);
    
    // Step 4: Create a review (which starts as pending)
    console.log('  4. Creating review for order...');
    const reviewResponse = await makeRequest('POST', '/api/v1/reviews', {
      orderId: seedOrderId,
      productId: seedProductId,
      rating: 5,
      comment: 'Great product for testing!'
    });
    
    let seedReviewId = null;
    if (reviewResponse.status !== 201) {
      console.log(`  ❌ Failed to create review: ${reviewResponse.status}`);
    } else {
      seedReviewId = reviewResponse.data.data?.reviewId || reviewResponse.data.data?._id;
      console.log(`  ✓ Review created: ${seedReviewId}`);
    }
    
    // Login back as admin for rest of tests
    const adminLoginResponse = await makeRequest('POST', '/api/auth/login', {
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD
    });
    
    if (adminLoginResponse.status !== 200) {
      console.error(`  ❌ Failed to restore admin login: ${adminLoginResponse.status}`);
    } else {
      console.log(`  ✓ Admin login restored after seeding`);
    }
    
    console.log(`${colors.green}✓ Data seeding completed${colors.reset}\n`);
    
    return {
      seedProductId,
      seedOrderId,
      seedReviewId
    };
  } catch (error) {
    console.error(`${colors.red}❌ Seeding error: ${error.message}${colors.reset}`);
    return null;
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

async function runTests() {
  console.log(`\n${colors.blue}${'='.repeat(80)}`);
  console.log('COMPREHENSIVE API TEST SUITE - E-commerce_API');
  console.log(`${'='.repeat(80)}${colors.reset}\n`);

  let adminToken = null;
  let userId = null;
  let productId = null;
  let orderId = null;
  let reviewId = null;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 1: AUTHENTICATION TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`${colors.cyan}🔐 AUTHENTICATION TESTS${colors.reset}\n`);

  // Test 1.1: Register new user
  {
    const testName = '1.1: Register new user';
    try {
      const response = await makeRequest('POST', '/api/auth/register', {
        name: 'Test User',
        email: `testuser_${Date.now()}@test.com`,
        password: 'Test@1234'
      });
      logTest(testName, response.status === 201, `Status: ${response.status}`);
      if (response.status === 201) {
        userId = response.data.data?.user?._id;
      }
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 1.2: Register with invalid email
  {
    const testName = '1.2: Register with invalid email (should fail)';
    try {
      const response = await makeRequest('POST', '/api/auth/register', {
        name: 'Test User',
        email: 'invalid-email',
        password: 'Test@1234'
      });
      logTest(testName, response.status !== 201, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 1.3: Register with missing fields
  {
    const testName = '1.3: Register with missing fields (should fail)';
    try {
      const response = await makeRequest('POST', '/api/auth/register', {
        name: 'Test User'
        // Missing email and password
      });
      logTest(testName, response.status !== 201, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 1.4: Login with admin credentials
  {
    const testName = '1.4: Login with admin credentials';
    try {
      const response = await makeRequest('POST', '/api/auth/login', {
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD
      });
      logTest(testName, response.status === 200, `Status: ${response.status}`);
      if (response.status === 200) {
        adminToken = response.data.data?.token;
        console.log(`  Token obtained and cookies set: ${response.headers['set-cookie'] ? 'Yes' : 'No (cookie already set)'}`);
      }
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 1.5: Login with invalid password
  {
    const testName = '1.5: Login with invalid password (should fail)';
    try {
      const response = await makeRequest('POST', '/api/auth/login', {
        email: DEFAULT_ADMIN_EMAIL,
        password: 'WrongPassword'
      });
      logTest(testName, response.status !== 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 1.6: Logout
  {
    const testName = '1.6: Logout';
    try {
      const response = await makeRequest('POST', '/api/auth/logout');
      logTest(testName, response.status === 200 || response.status === 201, `Status: ${response.status}`);
      
      // 🔐 FIX #3: Clear cookie jar after logout to prevent token persistence
      // This ensures the next request won't have leftover authentication tokens
      if (response.status === 200 || response.status === 201) {
        // Clear all cookies from the jar
        await cookieJar.removeAllCookies();
        console.log(`  ${colors.green}✓ Cookie jar cleared${colors.reset}`);
      }
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 2: ADMIN DASHBOARD TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${colors.cyan}📊 ADMIN DASHBOARD TESTS${colors.reset}\n`);

  // Re-login for admin tests
  {
    const response = await makeRequest('POST', '/api/auth/login', {
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD
    });
    adminToken = response.data.data?.token;
    console.log(`  Admin re-login status: ${response.status}, Token: ${adminToken ? 'Yes' : 'No'}, Cookies: ${response.headers['set-cookie'] ? 'Set' : 'Existing'}`);
    
    // Verify authentication is working before proceeding
    const verifyResponse = await makeRequest('GET', '/api/admin/dashboard/stats');
    if (verifyResponse.status === 200) {
      console.log(`  ✓ Authentication verified for admin tests`);
    } else {
      console.log(`  ❌ Authentication failed: ${verifyResponse.status}`);
    }
  }

  // 🌱 SEED TEST DATA (Fix #2 - Create test orders and reviews)
  const seedData = await seedTestData();
  if (seedData) {
    productId = seedData.seedProductId;
    orderId = seedData.seedOrderId;
    reviewId = seedData.seedReviewId;
    console.log(`  ✓ Test IDs captured: Product=${productId}, Order=${orderId}, Review=${reviewId}`);
  }

  // Test 2.1: Get dashboard stats
  {
    const testName = '2.1: Get dashboard stats (admin only)';
    try {
      const response = await makeRequest('GET', '/api/admin/dashboard/stats');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 2.2: Get dashboard stats without auth
  {
    const testName = '2.2: Get dashboard stats without auth (should fail)';
    // Create separate axios instance without credentials
    try {
      const response = await axios.get(`${BASE_URL}/api/admin/dashboard/stats`, {
        validateStatus: () => true
      });
      logTest(testName, response.status !== 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 2.3: Get low stock alerts
  {
    const testName = '2.3: Get low stock alerts';
    try {
      const response = await makeRequest('GET', '/api/admin/dashboard/low-stock');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 2.4: Get recent orders from dashboard
  {
    const testName = '2.4: Get recent orders from dashboard';
    try {
      const response = await makeRequest('GET', '/api/admin/dashboard/orders');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 3: PRODUCT MANAGEMENT TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${colors.cyan}📦 PRODUCT MANAGEMENT TESTS${colors.reset}\n`);

  // Test 3.1: Get admin products list
  {
    const testName = '3.1: Get admin products list (paginated)';
    try {
      const response = await makeRequest('GET', '/api/admin/products?page=1&limit=10');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
      if (response.status === 200 && response.data.data?.length > 0) {
        productId = response.data.data[0]._id;
        console.log(`  Product ID found: ${productId}`);
      }
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 3.2: Get public products list (v1)
  {
    const testName = '3.2: Get public products list (v1 route)';
    try {
      const response = await makeRequest('GET', '/api/v1/products?page=1&limit=10');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 3.3: Create new product
  {
    const testName = '3.3: Create new product';
    try {
      const response = await makeRequest('POST', '/api/admin/products', {
        title: { ar: 'منتج اختبار', en: 'Test Product' },
        description: { ar: 'وصف اختبار', en: 'Test Description' },
        category: 'Electronics',
        basePrice: 99.99,
        currency: 'USD',
        images: ['https://example.com/image.jpg'],
        specifications: { color: 'black', size: 'medium' }
      });
      logTest(testName, response.status === 201, `Status: ${response.status}`);
      if (response.status === 201) {
        productId = response.data.data?._id;
        console.log(`  New product created: ${productId}`);
      }
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 3.4: Create product without required fields
  {
    const testName = '3.4: Create product without required fields (should fail)';
    try {
      const response = await makeRequest('POST', '/api/admin/products', {
        title: { ar: 'منتج اختبار' }
        // Missing other required fields
      });
      logTest(testName, response.status !== 201, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 3.5: Get product details by ID
  {
    const testName = '3.5: Get product details by ID';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('GET', `/api/admin/products/${productId}`);
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 3.6: Get non-existent product
  {
    const testName = '3.6: Get non-existent product (should fail)';
    try {
      const response = await makeRequest('GET', `/api/admin/products/000000000000000000000000`);
      logTest(testName, response.status !== 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 3.7: Update product
  {
    const testName = '3.7: Update product (PATCH)';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/products/${productId}`, {
          title: { ar: 'منتج محدث', en: 'Updated Product' },
          category: 'Updated Category'
        });
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 3.8: Update product price
  {
    const testName = '3.8: Update product price';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/products/${productId}/price`, {
          newPrice: 149.99,
          currencyCode: 'USD'
        });
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 3.9: Update price with invalid value
  {
    const testName = '3.9: Update price with invalid value (should fail)';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/products/${productId}/price`, {
          newPrice: 'invalid'
        });
        logTest(testName, response.status !== 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 3.10: Get price history
  {
    const testName = '3.10: Get product price history';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('GET', `/api/admin/products/${productId}/price-history`);
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 3.11: Soft delete product
  {
    const testName = '3.11: Soft delete product';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('DELETE', `/api/admin/products/${productId}`);
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 3.12: Restore deleted product
  {
    const testName = '3.12: Restore deleted product';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/products/${productId}/restore`);
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 4: INVENTORY MANAGEMENT TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${colors.cyan}📦 INVENTORY MANAGEMENT TESTS${colors.reset}\n`);

  // Test 4.1: Get inventory list
  {
    const testName = '4.1: Get inventory list (paginated)';
    try {
      const response = await makeRequest('GET', '/api/admin/inventory?page=1&limit=10');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 4.2: Update inventory quantity
  {
    const testName = '4.2: Update inventory quantity';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/inventory/${productId}`, {
          locationName: 'المستودع الرئيسي',
          delta: 10,
          reason: 'Restock'
        });
        logTest(testName, response.status === 200 || response.status === 400, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 4.3: Update inventory with invalid delta
  {
    const testName = '4.3: Update inventory with invalid delta (should fail)';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/inventory/${productId}`, {
          locationName: 'Warehouse A',
          delta: 'invalid'
        });
        logTest(testName, response.status !== 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 4.4: Get inventory history
  {
    const testName = '4.4: Get inventory history for product';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('GET', `/api/admin/inventory/${productId}/history`);
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 5: ORDER MANAGEMENT TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${colors.cyan}🛒 ORDER MANAGEMENT TESTS${colors.reset}\n`);

  // Test 5.1: Get orders list
  {
    const testName = '5.1: Get orders list (paginated)';
    try {
      const response = await makeRequest('GET', '/api/admin/orders?page=1&limit=10');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
      if (response.status === 200 && response.data.data?.length > 0) {
        orderId = response.data.data[0]._id;
        console.log(`  Order ID found: ${orderId}`);
      }
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 5.2: Filter orders by status
  {
    const testName = '5.2: Filter orders by status';
    try {
      const response = await makeRequest('GET', '/api/admin/orders?status=Pending&page=1&limit=10');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 5.3: Get order details
  {
    const testName = '5.3: Get order details by ID';
    if (!orderId) {
      logTest(testName, false, 'No order ID available');
    } else {
      try {
        const response = await makeRequest('GET', `/api/admin/orders/${orderId}`);
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 5.4: Update order status
  {
    const testName = '5.4: Update order status';
    if (!orderId) {
      logTest(testName, false, 'No order ID available');
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/orders/${orderId}/status`, {
          status: 'Processing'
        });
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 5.5: Update order with invalid status
  {
    const testName = '5.5: Update order with invalid status (should fail)';
    if (!orderId) {
      logTest(testName, false, 'No order ID available');
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/orders/${orderId}/status`, {
          status: 'InvalidStatus'
        });
        logTest(testName, response.status !== 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 6: REVIEW MANAGEMENT TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${colors.cyan}⭐ REVIEW MANAGEMENT TESTS${colors.reset}\n`);

  // Test 6.1: Get pending reviews
  {
    const testName = '6.1: Get pending reviews';
    try {
      const response = await makeRequest('GET', '/api/admin/reviews?status=Pending&page=1&limit=10');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
      if (response.status === 200 && response.data.data?.length > 0) {
        reviewId = response.data.data[0]._id;
        console.log(`  Review ID found: ${reviewId}`);
      }
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 6.2: Approve review
  {
    const testName = '6.2: Approve review';
    if (!reviewId) {
      logTest(testName, false, 'No review ID available');
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/reviews/${reviewId}/approve`);
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 6.3: Reject review
  {
    const testName = '6.3: Reject review';
    if (!reviewId) {
      logTest(testName, false, 'No review ID available (trying with fake ID)');
      try {
        const response = await makeRequest('PATCH', `/api/admin/reviews/000000000000000000000000/reject`);
        logTest(testName, response.status !== 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/reviews/${reviewId}/reject`);
        logTest(testName, response.status === 200, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 7: AUDIT LOG TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${colors.cyan}📋 AUDIT LOG TESTS${colors.reset}\n`);

  // Test 7.1: Get audit logs
  {
    const testName = '7.1: Get audit logs';
    try {
      const response = await makeRequest('GET', '/api/admin/audit-logs?page=1&limit=20');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 7.2: Filter audit logs by operation
  {
    const testName = '7.2: Filter audit logs by operation';
    try {
      const response = await makeRequest('GET', '/api/admin/audit-logs?operation=UPDATE&page=1&limit=10');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 8: RECONCILIATION TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${colors.cyan}🔧 RECONCILIATION TESTS${colors.reset}\n`);

  // Test 8.1: Run data integrity check (read-only)
  {
    const testName = '8.1: Run data integrity check (GET)';
    try {
      const response = await makeRequest('GET', '/api/admin/reconcile');
      logTest(testName, response.status === 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 8.2: Run reconciliation with fixes
  {
    const testName = '8.2: Run reconciliation with fixes (POST)';
    try {
      const response = await makeRequest('POST', '/api/admin/reconcile', {});
      logTest(testName, response.status === 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 9: AUTHORIZATION & SECURITY TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${colors.cyan}🔒 AUTHORIZATION & SECURITY TESTS${colors.reset}\n`);

  // Test 9.1: Access admin endpoint without token (should fail)
  {
    const testName = '9.1: Access admin endpoint without token (should fail)';
    try {
      // Create separate axios instance without cookies to test unauthenticated access
      const noAuthAxios = axios.create({
        validateStatus: () => true
      });
      const response = await noAuthAxios.get(`${BASE_URL}/api/admin/products`);
      logTest(testName, response.status !== 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 9.2: Access admin endpoint with invalid cookie
  {
    const testName = '9.2: Access admin endpoint without cookie (should fail)';
    try {
      // Create request without credentials
      const response = await axios.get(`${BASE_URL}/api/admin/products`, {
        validateStatus: () => true
      });
      logTest(testName, response.status !== 200, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 9.3: Access admin endpoint after logout
  {
    const testName = '9.3: Access admin endpoint after logout (should fail)';
    try {
      // Logout first
      await makeRequest('POST', '/api/auth/logout');
      // Try to access admin endpoint
      const response = await makeRequest('GET', '/api/admin/products');
      logTest(testName, response.status !== 200, `Status: ${response.status}`);
      // Re-login for remaining tests
      await makeRequest('POST', '/api/auth/login', {
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD
      });
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 10: DATA VALIDATION TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${colors.cyan}✔️  DATA VALIDATION TESTS${colors.reset}\n`);

  // Test 10.1: Register with weak password
  {
    const testName = '10.1: Register with weak password (should fail)';
    try {
      const response = await makeRequest('POST', '/api/auth/register', {
        name: 'Test User',
        email: `weakpass_${Date.now()}@test.com`,
        password: '123'  // Too weak
      });
      logTest(testName, response.status !== 201, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 10.2: Create product with negative price
  {
    const testName = '10.2: Create product with negative price (should fail)';
    try {
      const response = await makeRequest('POST', '/api/admin/products', {
        title: { ar: 'منتج', en: 'Product' },
        description: { ar: 'وصف', en: 'Description' },
        category: 'Electronics',
        basePrice: -50,  // Negative price
        currency: 'USD'
      });
      logTest(testName, response.status !== 201, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // Test 10.3: Update inventory with very large delta
  {
    const testName = '10.3: Update inventory with very large delta';
    if (!productId) {
      logTest(testName, false, 'No product ID available');
    } else {
      try {
        const response = await makeRequest('PATCH', `/api/admin/inventory/${productId}`, {
          locationName: 'المستودع الرئيسي',
          delta: 999999999
        });
        logTest(testName, response.status === 200 || response.status === 400, `Status: ${response.status}`);
      } catch (error) {
        logTest(testName, false, error.message);
      }
    }
  }

  // Test 10.4: Register with empty string fields
  {
    const testName = '10.4: Register with empty string fields (should fail)';
    try {
      const response = await makeRequest('POST', '/api/auth/register', {
        name: '',
        email: '',
        password: ''
      });
      logTest(testName, response.status !== 201, `Status: ${response.status}`);
    } catch (error) {
      logTest(testName, false, error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FINAL REPORT
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${colors.blue}${'='.repeat(80)}`);
  console.log('TEST EXECUTION SUMMARY');
  console.log(`${'='.repeat(80)}${colors.reset}\n`);

  console.log(`Total Tests: ${stats.total}`);
  console.log(`${colors.green}Passed: ${stats.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${stats.failed}${colors.reset}`);
  console.log(`Success Rate: ${((stats.passed / stats.total) * 100).toFixed(2)}%\n`);

  if (stats.failed > 0) {
    console.log(`${colors.yellow}FAILED TESTS:${colors.reset}`);
    stats.issues.forEach((issue, idx) => {
      console.log(`\n${idx + 1}. ${issue.test}`);
      console.log(`   ${issue.details}`);
    });
  }

  console.log(`\n${colors.blue}${'='.repeat(80)}${colors.reset}`);
}

// Run tests
runTests().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset}`, error.message);
  process.exit(1);
});
