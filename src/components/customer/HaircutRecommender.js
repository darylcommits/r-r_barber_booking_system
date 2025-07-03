// components/customer/HaircutRecommender.js (Enhanced with camera feature)
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
// Import the logo for branding consistency
import logoImage from '../../assets/images/raf-rok-logo.png';

const HaircutRecommender = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [faceShape, setFaceShape] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previousRecommendations, setPreviousRecommendations] = useState([]);
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'camera'
  // Add state for animations
  const [animateItems, setAnimateItems] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    fetchPreviousRecommendations();
    // Trigger animations after component mounts
    setTimeout(() => {
      setAnimateItems(true);
    }, 300);

    // Clean up camera stream on unmount
    return () => {
      stopCamera();
    };
  }, []);

  const fetchPreviousRecommendations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('haircut_recommendations')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setPreviousRecommendations(data || []);
    } catch (error) {
      console.error('Error fetching previous recommendations:', error);
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    try {
      setError('');
      const constraints = {
        video: {
          facingMode: 'user', // Use front camera for selfies
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraReady(true);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Could not access camera. Please check permissions or try uploading a photo instead.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsCameraReady(false);
  };

  const takePicture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Match canvas size to video size
      const width = video.videoWidth;
      const height = video.videoHeight;
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw video frame to canvas
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, width, height);
      
      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL('image/jpeg');
      setSelectedImage(dataUrl);
      
      // Stop camera
      stopCamera();
      
      // Switch back to upload view to show the captured image
      setActiveTab('upload');
    }
  };

  const switchToCamera = () => {
    setActiveTab('camera');
    startCamera();
  };

  const switchToUpload = () => {
    setActiveTab('upload');
    stopCamera();
  };

  const analyzeFaceShape = async () => {
    if (!selectedImage) {
      setError('Please upload or take a photo first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Simulate face shape detection
      // In a real implementation, you would use an AI service like Google Vision API, Azure Face API, etc.
      const detectedShape = await simulateFaceShapeDetection(selectedImage);
      setFaceShape(detectedShape);
      
      // Get recommendations based on face shape
      const haircutRecommendations = getRecommendationsByFaceShape(detectedShape);
      setRecommendations(haircutRecommendations);

      // Save recommendations to database
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('haircut_recommendations')
        .insert([{
          customer_id: user.id,
          face_shape: detectedShape,
          recommended_styles: haircutRecommendations,
          image_url: selectedImage
        }]);

      if (error) throw error;

      // Refresh previous recommendations
      fetchPreviousRecommendations();

    } catch (error) {
      console.error('Error analyzing face shape:', error);
      setError('Failed to analyze face shape. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Simulate face shape detection (replace with actual AI implementation)
  const simulateFaceShapeDetection = async (imageData) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Return random face shape for demo
    const shapes = ['Round', 'Oval', 'Square', 'Heart', 'Long', 'Diamond'];
    return shapes[Math.floor(Math.random() * shapes.length)];
  };

  // Get haircut recommendations based on face shape
 const getRecommendationsByFaceShape = (shape) => {
  const recommendations = {
    'Round': [
      {
        name: 'Layered Cut',
        description: 'Layers add height and length to balance round features',
        image: 'https://vagazine.com/vaga_v3/wp-content/uploads/2025/03/layered-haircuts-for-men.jpeg'
      },
      {
        name: 'Side Part',
        description: 'Creates the illusion of a longer face',
        image: 'https://cdn.shopify.com/s/files/1/0899/2676/2789/files/Classic_Side_Part.jpg?v=1735326797'
      },
      {
        name: 'Pompadour',
        description: 'Height on top elongates the face',
        image: 'https://i.pinimg.com/736x/07/4a/ed/074aedf7e526a4433d3aedce20a0fd46.jpg'
      }
    ],
    'Oval': [
      {
        name: 'Classic Cut',
        description: 'Almost any style works with oval face shape',
        image: 'https://content.latest-hairstyles.com/wp-content/uploads/classic-side-part-for-thick-haired-men.jpg'
      },
      {
        name: 'Fade',
        description: 'Clean and versatile look',
        image: 'https://www.barberstake.com/wp-content/uploads/2025/01/Mid-Drop-Fade.jpg'
      },
      {
        name: 'Textured Quiff',
        description: 'Modern and stylish option',
        image: 'https://cdn.shopify.com/s/files/1/0434/4749/files/Short_Textured_Quiff_3_grande.jpg?v=1542730429'
      }
    ],
    'Square': [
      {
        name: 'Soft Layers',
        description: 'Softens strong jawline',
        image: 'https://cdn.shopify.com/s/files/1/0255/2417/4922/files/Textured_Crop_-_Layered_Haircuts_For_Men_1.jpg?v=1727693031'
      },
      {
        name: 'Side-Swept Fringe',
        description: 'Adds softness to angular features',
        image: 'https://i.pinimg.com/474x/76/42/de/7642deda9427f759399fdd9e6d048548.jpg'
      },
      {
        name: 'Textured Top',
        description: 'Creates visual interest on top',
        image: 'https://i.pinimg.com/564x/da/00/e0/da00e0e4d4b756eefee0accc28124dd0.jpg'
      }
    ],
    'Heart': [
      {
        name: 'Medium Length',
        description: 'Balances wider forehead',
        image: 'https://i0.wp.com/therighthairstyles.com/wp-content/uploads/2015/03/10-mens-medium-blonde-hairstyle.jpg?resize=500%2C568&ssl=1'
      },
      {
        name: 'Side Part',
        description: 'Draws attention to eyes',
        image: 'https://bespokeunit.com/wp-content/uploads/2020/05/Side-Part-Comb-Over-With-Pompadour.jpg'
      },
      {
        name: 'Layered Fade',
        description: 'Adds fullness at jawline',
        image: 'https://menshaircuts.com/wp-content/uploads/2021/07/layered-haircuts-for-men-short-bald-fade-spiky-683x1024.jpg'
      }
    ],
    'Long': [
      {
        name: 'Short Sides',
        description: 'Creates width on sides',
        image: 'https://www.barberstake.com/wp-content/uploads/2024/10/Trendy-Long-Hair-Top-with-Short-Sides.jpg'
      },
      {
        name: 'Full Beard',
        description: 'Adds volume to lower face',
        image: 'https://wellgroomedgentleman.com/wp-content/uploads/2023/10/9._Tall_faux-hawk_that_extends_down_the_neck.width-800.jpg'
      },
      {
        name: 'Undercut',
        description: 'Modern and edgy style',
        image: 'https://blog.goldsupplier.com/wp-content/uploads/2024/10/second-row-crochet-2024-10-25T154110.321.png'
      }
    ],
    'Diamond': [
      {
        name: 'Textured Top',
        description: 'Adds width at forehead',
        image: 'https://i.pinimg.com/564x/83/4a/19/834a197f2f57641103e344478234d3cb.jpg'
      },
      {
        name: 'Side Part',
        description: 'Balances wide cheekbones',
        image: 'https://i.pinimg.com/736x/d2/70/9b/d2709b74583d8392ff287dae0c5fe415.jpg'
      },
      {
        name: 'Crew Cut',
        description: 'Classic and flattering',
        image: 'https://storage.googleapis.com/postcrafts-public-content/hairstyleai/blog/549edd52-ff15-408d-80b1-a88e15d2bc99.jpg'
      }
    ]
  };

  return recommendations[shape] || recommendations['Oval'];
};

  return (
    <div className="container py-4">
      {/* Header with logo */}
      <div className="row mb-4">
        <div className="col">
          <div className="recommender-header p-4 rounded shadow-sm d-flex align-items-center">
            <div>
              <div className="d-flex align-items-center mb-2">
                <img 
                  src={logoImage} 
                  alt="Raf & Rok" 
                  className="recommender-logo me-3" 
                  height="40"
                  style={{
                    backgroundColor: '#ffffff',
                    padding: '3px',
                    borderRadius: '5px'
                  }}
                />
                <h1 className="h3 mb-0 text-white">Haircut Recommender</h1>
              </div>
              <p className="text-light mb-0">
                <i className="bi bi-magic me-2"></i>
                Get personalized haircut recommendations based on your face shape
              </p>
            </div>
            <div className="ms-auto">
              <Link to="/dashboard" className="btn btn-light">
                <i className="bi bi-arrow-left me-2"></i>
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-md-10 mx-auto">
          <div className={`card recommender-card shadow-sm mb-4 ${animateItems ? 'card-animated' : ''}`}>
            <div className="card-body p-4">
              {error && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                  <div className="d-flex align-items-center">
                    <i className="bi bi-exclamation-triangle-fill me-2 fs-4"></i>
                    <div>{error}</div>
                  </div>
                  <button type="button" className="btn-close" onClick={() => setError('')}></button>
                </div>
              )}

              <div className="row">
                <div className="col-md-6">
                  {/* Tabs for Upload/Camera */}
                  <div className="upload-section mb-4">
                    <div className="image-source-tabs mb-4">
                      <div className="tab-buttons">
                        <button 
                          type="button" 
                          className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`} 
                          onClick={switchToUpload}
                        >
                          <i className="bi bi-cloud-upload me-2"></i>
                          Upload Photo
                        </button>
                        <button 
                          type="button" 
                          className={`tab-button ${activeTab === 'camera' ? 'active' : ''}`} 
                          onClick={switchToCamera}
                        >
                          <i className="bi bi-camera me-2"></i>
                          Take Photo
                        </button>
                      </div>
                    </div>

                    {/* Upload Tab Content */}
                    {activeTab === 'upload' && (
                      <div className="tab-content">
                        {!selectedImage ? (
                          <div className="upload-area">
                            <input
                              type="file"
                              className="file-input"
                              id="photo-upload"
                              accept="image/*"
                              onChange={handleImageUpload}
                            />
                            <label htmlFor="photo-upload" className="upload-label">
                              <div className="upload-icon">
                                <i className="bi bi-cloud-arrow-up"></i>
                              </div>
                              <div className="upload-text">
                                <span className="upload-title">Drop your photo here</span>
                                <span className="upload-subtitle">or click to browse</span>
                              </div>
                            </label>
                            <div className="upload-tip mt-2">
                              <i className="bi bi-info-circle me-2"></i>
                              Upload a clear front-facing photo for best results
                            </div>
                          </div>
                        ) : (
                          <div className="preview-container">
                            <div className="image-preview">
                              <img
                                src={selectedImage}
                                alt="Your photo"
                                className="preview-image"
                              />
                              <button 
                                className="btn btn-sm btn-light clear-image" 
                                onClick={() => setSelectedImage(null)}
                              >
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                            <div className="mt-3 text-center">
                              <button
                                className="btn btn-analyze"
                                onClick={analyzeFaceShape}
                                disabled={loading}
                              >
                                {loading ? (
                                  <>
                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                    Analyzing Face Shape...
                                  </>
                                ) : (
                                  <>
                                    <i className="bi bi-magic me-2"></i>
                                    Get Haircut Recommendations
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Camera Tab Content */}
                    {activeTab === 'camera' && (
                      <div className="tab-content">
                        <div className="camera-container">
                          <div className="video-container">
                            <video 
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="camera-preview"
                              onLoadedMetadata={() => setIsCameraReady(true)}
                            />
                            {isCameraReady && (
                              <div className="camera-overlay">
                                <div className="camera-guide">
                                  <div className="face-outline"></div>
                                </div>
                                <div className="camera-instructions">
                                  Position your face in the center
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="camera-controls mt-3">
                            <button 
                              className="btn btn-capture"
                              onClick={takePicture}
                              disabled={!isCameraReady}
                            >
                              <i className="bi bi-camera-fill"></i>
                            </button>
                          </div>
                          <div className="camera-tip mt-2">
                            <i className="bi bi-info-circle me-2"></i>
                            Make sure your face is well-lit and centered
                          </div>
                        </div>
                        {/* Hidden canvas for capturing images */}
                        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="recommendations-section">
                    {faceShape && recommendations.length > 0 ? (
                      <div className="result-container">
                        <div className="face-shape-result mb-4">
                          <h5 className="section-title">Your Face Shape</h5>
                          <div className="face-shape-display">
                            <div className="shape-icon">
                              <i className={`bi bi-${
                                faceShape === 'Round' ? 'circle' :
                                faceShape === 'Oval' ? 'egg' :
                                faceShape === 'Square' ? 'square' :
                                faceShape === 'Heart' ? 'heart' :
                                faceShape === 'Long' ? 'rectangle-vertical' :
                                'diamond'
                              }`}></i>
                            </div>
                            <div className="shape-name">{faceShape}</div>
                          </div>
                        </div>
                        
                        <h5 className="section-title mb-3">Recommended Haircuts</h5>
                        <div className="haircut-recommendations">
                          {recommendations.map((rec, index) => (
                            <div key={index} className="haircut-item">
                              <div className="haircut-image">
                                <img
                                  src={rec.image}
                                  className="img-fluid"
                                  alt={rec.name}
                                />
                              </div>
                              <div className="haircut-info">
                                <h5 className="haircut-name">{rec.name}</h5>
                                <p className="haircut-description">
                                  {rec.description}
                                </p>
                                <Link to="/book" className="btn btn-book-style">
                                  <i className="bi bi-calendar-plus me-2"></i>
                                  Book This Style
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="empty-recommendations">
                        <div className="empty-icon">
                          <i className="bi bi-scissors"></i>
                        </div>
                        <h5>No Recommendations Yet</h5>
                        <p className="text-muted">
                          Upload or take a photo and analyze to get personalized haircut recommendations
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Previous Recommendations */}
          {previousRecommendations.length > 0 && (
            <div className={`card history-card shadow-sm ${animateItems ? 'card-animated' : ''}`} style={{ animationDelay: '0.2s' }}>
              <div className="card-header">
                <h5 className="mb-0">
                  <i className="bi bi-clock-history me-2"></i>
                  Your Previous Recommendations
                </h5>
              </div>
              <div className="card-body">
                <div className="row history-container">
                  {previousRecommendations.map((prev, index) => (
                    <div key={prev.id} className="col-md-6 mb-3">
                      <div className="history-item">
                        <div className="history-header">
                          <div className="d-flex align-items-center">
                            <div className="shape-badge me-2">
                              <i className={`bi bi-${
                                prev.face_shape === 'Round' ? 'circle' :
                                prev.face_shape === 'Oval' ? 'egg' :
                                prev.face_shape === 'Square' ? 'square' :
                                prev.face_shape === 'Heart' ? 'heart' :
                                prev.face_shape === 'Long' ? 'rectangle-vertical' :
                                'diamond'
                              }`}></i>
                            </div>
                            <h6 className="mb-0">Face Shape: {prev.face_shape}</h6>
                          </div>
                          <div className="history-date">
                            <i className="bi bi-calendar3 me-1"></i>
                            {new Date(prev.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="history-styles">
                          {prev.recommended_styles?.slice(0, 3).map((style, idx) => (
                            <div key={idx} className="history-style">
                              <div className="style-image">
                                <img
                                  src={style.image}
                                  className="img-fluid"
                                  alt={style.name}
                                />
                              </div>
                              <div className="style-name">{style.name}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HaircutRecommender;