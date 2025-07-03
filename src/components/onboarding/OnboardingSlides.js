// components/onboarding/OnboardingSlides.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './OnboardingSlides.css';

// Import our barbershop SVG illustrations
import { 
  HaircutIllustration, 
  BookingIllustration 
} from '../illustrations/BarberIllustrations';

// Import logo image - update this path to match your project structure
import barberLogo from '../../assets/images/raf-rok-logo.png';

// Logo Component using image
const BarberShopLogo = () => (
  <div className="barber-logo">
    <div className="logo-image-container">
      <img src={barberLogo} alt="Barber Shop Logo" className="logo-image" />
    </div>
    <div className="logo-text">
      <h1>RAF & ROK SHOP</h1>
      <p>BARBERSHOP</p>
    </div>
  </div>
);

const OnboardingSlides = ({ onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (onComplete) {
        onComplete();
      }
    };
  }, [onComplete]);

  const handleComplete = () => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    
    if (onComplete) {
      onComplete();
    }
  };

  const handleSkip = () => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    
    if (onComplete) {
      onComplete();
    }
  };

  const handleNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      handleComplete();
    }
  };

  const slides = [
    {
      title: "BARBER SHOP",
      subtitle: "Old School Style",
      description: "Experience the traditional barbershop service with a modern twist.",
      Illustration: BarberShopLogo
    },
    {
      title: "Premium Services",
      subtitle: "Expert Haircuts & Styling",
      description: "Our experienced barbers are dedicated to helping you look your best with precision cuts and styling.",
      Illustration: HaircutIllustration
    },
    {
      title: "Easy Booking",
      subtitle: "At Your Convenience",
      description: "Book appointments with your favorite barbers anytime, anywhere with just a few taps.",
      Illustration: BookingIllustration
    }
  ];

  // Current slide data
  const slide = slides[currentSlide];
  const Illustration = slide.Illustration;

  return (
    <div className="dark-onboarding">
      <div className="dark-slide-card">
        {/* Top Image Section */}
        <div className="slide-illustration">
          <Illustration />
        </div>

        {/* Title and Subtitle */}
        {currentSlide === 0 ? (
          <div className="logo-container">
            {/* Logo text is handled in the illustration component */}
          </div>
        ) : (
          <>
            <h2 className="slide-title">
              {slide.title}
            </h2>
            <h3 className="slide-subtitle">
              {slide.subtitle}
            </h3>
          </>
        )}

        {/* Description - only shown on non-logo slides */}
        {currentSlide !== 0 && (
          <p className="slide-description">
            {slide.description}
          </p>
        )}

        {/* Indicators */}
        <div className="slide-indicators">
          {slides.map((_, index) => (
            <div 
              key={index} 
              className={`indicator ${currentSlide === index ? 'active' : ''}`}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>

        {/* Action Button */}
        {currentSlide === slides.length - 1 ? (
          <button className="action-button" onClick={handleComplete}>
            Get Started
          </button>
        ) : (
          <button className="action-button" onClick={handleNextSlide}>
            Next
          </button>
        )}

        {/* Skip Link */}
        {currentSlide < slides.length - 1 && (
          <div className="skip-link">
            <span onClick={handleSkip}>Skip</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingSlides;