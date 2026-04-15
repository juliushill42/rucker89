Rucker89 Flight Simulator
Rucker89 is a high-fidelity, web-based helicopter flight simulation engine. Built with TypeScript and focused on aerodynamic realism, it simulates complex rotor dynamics, atmospheric conditions, and ground effect interactions, specifically modeled for operations around the Fort Rucker environment.

🚀 Key Features
Advanced Aerodynamics: Realistic implementation of RotorSystem.ts and GroundEffect.ts for authentic flight behavior.

Physics-Driven Model: A dedicated FlightModel.ts that handles lift, drag, and torque physics.

Dynamic Environment: Integrated WeatherSystem.ts and Atmosphere.ts to simulate varying flight conditions.

Custom Map: Specifically designed FortRuckerMap.ts for regional training scenarios.

Cross-Platform Builds: Includes deployment scripts for both Windows (build.ps1) and Unix/Linux (build.sh).

📂 Project Structure
Plaintext
├── src/
│   ├── FlightModel.ts      # Core physics engine
│   ├── RotorSystem.ts       # Main rotor & tail rotor dynamics
│   ├── GroundEffect.ts      # Proximity-to-ground lift calculations
│   ├── Atmosphere.ts        # Air density and pressure modeling
│   ├── WeatherSystem.ts     # Wind and environmental variables
│   ├── HelicopterModel.ts   # Aircraft-specific logic
│   ├── FortRuckerMap.ts     # Scenery and coordinate mapping
│   └── InputHandler.ts      # Cyclic, collective, and pedal mapping
├── index.html               # Application entry point
├── App.ts                   # Main application logic
└── AircraftConfig.ts        # Performance constants and aircraft specs
🛠 Installation & Setup
Prerequisites
Node.js (v16.x or higher recommended)

npm (comes with Node.js)

Setup
Clone the repository:

Bash
git clone https://github.com/juliushill42/rucker89.git
cd rucker89
Install dependencies:

Bash
npm install
Build the project:

Windows: ./build.ps1

Linux/Mac: ./build.sh

🕹 Usage
To start the development server:

Bash
npm start
Open your browser to http://localhost:3000 (or the port specified in your console) to begin flight operations.

⚙️ Configuration
You can modify aircraft performance characteristics (such as weight, rotor diameter, and engine power) in AircraftConfig.ts. Map coordinates and environmental settings can be adjusted in FortRuckerMap.ts and WeatherSystem.ts respectively.

🤝 Contributing
Fork the Project

Create your Feature Branch (git checkout -b feature/NewAerodynamics)

Commit your Changes (git commit -m 'Add new physics feature')

Push to the Branch (git push origin feature/NewAerodynamics)

Open a Pull Request

📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

Developer Tip: Since you are using main.cjs alongside TypeScript, ensure your tsconfig.json is configured to output to the correct directory before running your build scripts. 
