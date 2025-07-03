// components/products/ProductCatalog.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const ProductCatalog = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchProducts();
    loadCart();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [products, searchQuery, selectedCategory]);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const loadCart = () => {
    const savedCart = localStorage.getItem('rnrbooker_cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  };

  const saveCart = (updatedCart) => {
    setCart(updatedCart);
    localStorage.setItem('rnrbooker_cart', JSON.stringify(updatedCart));
  };

  const filterProducts = () => {
    let filtered = products;

    if (searchQuery) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedCategory !== 'all') {
      // This would filter by category if categories were implemented
      // For now, we'll assume all products are shown
    }

    setFilteredProducts(filtered);
  };

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    let updatedCart;

    if (existingItem) {
      updatedCart = cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    } else {
      updatedCart = [...cart, { ...product, quantity: 1 }];
    }

    saveCart(updatedCart);
    setSuccess(`Added ${product.name} to cart`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const removeFromCart = (productId) => {
    const updatedCart = cart.filter(item => item.id !== productId);
    saveCart(updatedCart);
  };

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity === 0) {
      removeFromCart(productId);
      return;
    }

    const updatedCart = cart.map(item =>
      item.id === productId
        ? { ...item, quantity: newQuantity }
        : item
    );
    saveCart(updatedCart);
  };

  const getCartItemCount = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0).toFixed(2);
  };

  const checkout = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create order record
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          customer_id: user.id,
          total_amount: getCartTotal(),
          items: cart,
          status: 'pending'
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Log the purchase
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'product_purchase',
        details: {
          order_id: order.id,
          items: cart,
          total: getCartTotal()
        }
      });

      // Clear cart
      saveCart([]);
      setSuccess('Order placed successfully!');
      
      // In a real app, you'd redirect to payment or confirmation page
      
    } catch (error) {
      console.error('Error placing order:', error);
      setError('Failed to place order. Please try again.');
    }
  };

  const categories = ['all', 'hair care', 'styling', 'beard care', 'tools'];

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <div className="row">
        <div className="col-md-9">
          <div className="card">
            <div className="card-header">
              <div className="row align-items-center">
                <div className="col-md-6">
                  <h3 className="mb-0">Shop Products</h3>
                </div>
                <div className="col-md-6">
                  <input
                    type="search"
                    className="form-control"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}

              {success && (
                <div className="alert alert-success" role="alert">
                  {success}
                </div>
              )}

              {/* Category Filter */}
              <div className="mb-4">
                <div className="btn-group" role="group">
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={`btn btn-outline-primary ${selectedCategory === category ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products Grid */}
              <div className="row g-4">
                {filteredProducts.map((product) => (
                  <div key={product.id} className="col-md-4">
                    <div className="card h-100">
                      <img
                        src={product.image_url || '/api/placeholder/200/200'}
                        className="card-img-top"
                        alt={product.name}
                        style={{ height: '200px', objectFit: 'cover' }}
                      />
                      <div className="card-body d-flex flex-column">
                        <h5 className="card-title">{product.name}</h5>
                        <p className="card-text text-muted flex-grow-1">
                          {product.description}
                        </p>
                        <div className="d-flex justify-content-between align-items-center">
                          <h6 className="mb-0">₱{product.price}</h6>
                          <small className="text-muted">
                            {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock'}
                          </small>
                        </div>
                        <button
                          className="btn btn-primary mt-3"
                          onClick={() => addToCart(product)}
                          disabled={product.stock_quantity === 0}
                        >
                          {product.stock_quantity === 0 ? 'Out of Stock' : 'Add to Cart'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filteredProducts.length === 0 && (
                <div className="text-center py-5">
                  <div className="display-4 text-muted mb-3">
                    <i className="bi bi-search"></i>
                  </div>
                  <p className="text-muted">No products found matching your search.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Shopping Cart Sidebar */}
        <div className="col-md-3">
          <div className="card sticky-top" style={{ top: '20px' }}>
            <div className="card-header">
              <h5 className="mb-0">Shopping Cart ({getCartItemCount()})</h5>
            </div>
            <div className="card-body">
              {cart.length === 0 ? (
                <p className="text-muted text-center">Your cart is empty</p>
              ) : (
                <>
                  <div className="cart-items mb-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {cart.map((item) => (
                      <div key={item.id} className="d-flex align-items-center mb-3">
                        <img
                          src={item.image_url || '/api/placeholder/50/50'}
                          alt={item.name}
                          className="rounded me-2"
                          style={{ width: '50px', height: '50px', objectFit: 'cover' }}
                        />
                        <div className="flex-grow-1">
                          <h6 className="mb-0 small">{item.name}</h6>
                          <small className="text-muted">₱{item.price}</small>
                        </div>
                        <div className="d-flex align-items-center">
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            -
                          </button>
                          <span className="mx-2">{item.quantity}</span>
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <hr />
                  <div className="d-flex justify-content-between mb-3">
                    <strong>Total:</strong>
                    <strong>₱{getCartTotal()}</strong>
                  </div>
                  <button
                    className="btn btn-primary w-100"
                    onClick={checkout}
                  >
                    Checkout
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCatalog;