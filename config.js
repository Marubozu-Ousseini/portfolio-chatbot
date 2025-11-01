

window.siteContent = {
    // Personal Information
    personalInfo: {
        name: "OUSSEINI OUMAROU",
        title: "Cloud & AI Consultant",
        subtitle: "Solutions Architect - Transforming businesses with cutting-edge cloud solutions and AI technologies",
        description: "My name is OUSSEINI OUMAROU. I am a highly motivated Cloud and AI Consultant, uniquely positioned with a strong foundation in both Cloud computing and Artificial Intelligence. My expertise is validated by industry leading certifications. This robust skill set, combined with my background in Cryptocurrency, Web3, and Blockchain, allows me to architect and deploy innovative, scalable, and secure cloud-native solutions, with a particular focus on leveraging advanced AI capabilities to drive transformative business outcomes. I am dedicated to pushing the boundaries of technology to create intelligent systems that redefine possibilities.",
        email: "meandyougtn@gmail.com",
        phone: "+1(917) 672-6792",
        socialLinks: {
            linkedin: "https://www.linkedin.com/in/marubozu",
            github: "https://github.com/Marubozu-Ousseini",
            twitter: "https://twitter.com/O%27Marubozu%20Sensei"
        },
            
        // Profile Picture Configuration
    // Option 1: Use a URL to your profile picture
    // Use the local image for best performance and reliability
    profilePicture: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/profile%20pic.jpg", // Use your local image file
        
        // Option 2: Use a local image file
        // Create a folder called "images" in your website directory and add your photo
        // Then set profilePicture to: "images/your-photo.jpg"
        
        // Option 3: Leave empty to use the default icon
        // profilePicture: "" // This will show the default user icon
    },

    // Credly Integration Settings
    credly: {
        // Replace 'YOUR_CREDLY_USER_ID' with your actual Credly user ID
        // You can find this in your Credly profile URL: https://www.credly.com/users/YOUR_USER_ID/badges
        userId: "ousseini-oumarou.fa8d6a81",
        
        // Optional: Set to true to show only specific certifications by their names
        filterCertifications: false,
        allowedCertifications: [
            "AWS Certified Solutions Architect",
            "AWS Certified Developer",
            "AWS Certified SysOps Administrator"
        ],
        
        // Fallback: Manual certifications if API fails
        // Set useManualCertifications to true if Credly API is not working
        useManualCertifications: true,
        manualCertifications: [
            {
                id: "AWS-SAA-03",
                name: "AWS Certified Solutions Architect - Associate",
                image_url: "https://images.credly.com/images/0e284c3f-5164-4b21-8660-0d84737941bc/image.png",
                issued_at_date: "2025-07-31",
                public_url: "https://www.credly.com/badges/69936fdc-8dfc-4c68-9f95-bdd2ed0ff3e8",
                description: "Earners of this certification have a comprehensive understanding of AWS services and technologies. They demonstrated the ability to build secure and robust solutions using architectural design principles based on customer requirements. Badge owners are able to strategically design well-architected distributed systems that are scalable, resilient, efficient, and fault-tolerant."
            },
            {
                id: "MLA-C01",
                name: "AWS Certified Machine Learning Engineer – ONGOING",
                image_url: "https://images.credly.com/size/340x340/images/1a634b4e-3d6b-4a74-b118-c0dcb429e8d2/image.png",
                issued_at_date: "ongoing",
                public_url: "ongoing",
                description: "Earners of this badge have knowledge and skills in developing, deploying, maintaining, and monitoring ML solutions to meet AI/ML objectives. They know how to ingest, transform, validate, and prepare data for ML modeling. They have skills in implementing and operationalizing ML workloads in production. They can select modeling approaches and analyze model performance. They have the expertise to monitor ML solutions and to secure ML systems and resources."
            },
            {
                id: "AWS-AIF",
                name: "AWS Certified AI Practitioner",
                image_url: "https://images.credly.com/size/340x340/images/834f2c8d-2d2c-4ce7-9580-02a351c31626/image.png",
                issued_at_date: "2025-02-14",
                public_url: "https://www.credly.com/badges/95f2e056-98fa-4293-b452-87eda0b367fb",
                description: "Earners of this badge understand AI, ML, and generative AI concepts, methods, and strategies in general and on AWS. They can determine the correct types of AI/ML technologies to apply to specific use cases and know how to use AI, ML, and generative AI technologies responsibly. They are familiar with the AWS Global Infrastructure, core AWS services and use cases, AWS service pricing models, and the AWS shared responsibility model for security and compliance in the AWS Cloud."
            },
            {
                id: "AWS-CLF",
                name: "AWS Certified Cloud Practitioner", 
                image_url: "https://images.credly.com/images/00634f82-b07f-4bbd-a6bb-53de397fc3a6/image.png",
                issued_at_date: "2025-01-27",
                public_url: "https://www.credly.com/badges/3901c884-0964-4de6-ae88-d6ed1d568ec8",
                description: "Earners of this certification have a fundamental understanding of IT services and their uses in the AWS Cloud. They demonstrated cloud fluency and foundational AWS knowledge. Badge owners are able to identify essential AWS services necessary to set up AWS-focused projects."
            },
            {
                id: "GitHub",
                name: "GitHub Foundations",
                image_url: "https://learn.microsoft.com/en-us/training/achievements/8-learn-continuous-integration-with-github-actions.svg",
                issued_at_date: "2024-02-12",
                public_url: "https://learn.microsoft.com/api/achievements/share/fr-fr/SENSEOMarubozu-7196/ZKL3PFZ2?sharingId=1D9E38C2F04E7F7D",
                description: "Earning the GitHub Foundations Certification validates my comprehensive understanding of the GitHub platform, demonstrating proficiency in Git version control, repository management, collaborative workflows using pull requests and branches, and project management through Issues and Projects to support efficient software development."
            },
            {
                id: "Google IT Support",
                name: "Google IT Support Certificate",
                image_url: "https://images.credly.com/size/340x340/images/ae2f5bae-b110-4ea1-8e26-77cf5f76c81e/GCC_badge_IT_Support_1000x1000.png",
                issued_at_date: "2024-06-23",
                public_url: "https://www.credly.com/badges/cb841f43-e93f-4093-bc4b-ce11a57f5d40",
                description: "Those who earn the Google IT Support Certificate, developed by Google, have demonstrated their competence in foundational IT service and troubleshooting. Through hands-on activities and assessments, graduates develop proficiency in troubleshooting and customer service, networking, operating systems, system administration, and security, preparing them for entry-level roles."
            },
            {
                id: "Google AI",
                name: "Google AI Essentials V1",
                image_url: "https://images.credly.com/size/340x340/images/ea3eec65-ddad-4242-9c59-1defac0fa2d9/image.png",
                issued_at_date: "2024-10-02",
                public_url: "https://www.credly.com/badges/387255ca-9227-4419-aedb-94074f6716d3",
                description: "Those who earn the Google AI Essentials Certificate, developed by Google, have demonstrated their competence in integrating AI into their work. Through hands-on activities and assessments, graduates develop a foundational understanding of AI principles and practical proficiency in applying generative AI tools to workplace tasks, including writing effective prompts and using AI responsibly."
            },
            {
                id: "AWS Educate ML",
                name: "AWS Educate Machine Learning Foundations",
                image_url: "https://images.credly.com/size/340x340/images/247efe36-9fa6-4209-ad56-0fd522283872/blob",
                issued_at_date: "2024-10-13",
                public_url: "https://www.credly.com/badges/4da8afcc-b0a7-410a-be3a-3860aed7591d",
                description: "Earners of this badge have completed the Machine Learning Foundations training and achieved the required scores on the post-course assessment. They have demonstrated the ability to discuss the fundamental concepts of machine learning and how to apply the machine learning pipeline to solve a business problem."
            },
            {
                id: "AI solutions on Azure",
                name: "Plan and prepare to develop AI solutions on Azure",
                image_url: "https://learn.microsoft.com/learn/achievements/generic-badge.svg",
                issued_at_date: "2025-05-17",
                public_url: "https://learn.microsoft.com/en-us/users/senseomarubozu-7196/achievements/",
                description: "Microsoft Azure offers multiple services that enable developers to build amazing AI-powered solutions. Proper planning and preparation involves identifying the services I can use and create an optimal working environment for your development team."
            },
            {
                id: "AWS Cloud Quest",
                name: "AWS Cloud Quest: Cloud Practitioner",
                image_url: "https://images.credly.com/size/340x340/images/30816e43-2550-4e1c-be22-3f03c5573bb9/blob",
                issued_at_date: "2025-05-17",
                public_url: "https://www.credly.com/badges/f50319e4-db3b-42c0-8fbd-1bc1283ed689",
                description: "Earners of this badge have demonstrated basic solution building knowledge using AWS services and have a fundamental understanding of AWS Cloud concepts. Badge earners have acquired hands-on experience with compute, networking, database and security services."
            }
        ]
    },

    // About Section Statistics
    stats: {
        yearsExperience: "2+",
        projectsCompleted: "50+",
        clientsServed: "10+"
    },

    // Projects Section
    projects: [
        {
            id: 1,
            title: "Sensei – AI Portfolio Chatbot",
            description: "Sensei is a serverless AI portfolio chatbot that answers questions about my work in real time. It uses an S3-backed RAG store, a lightweight TF-IDF retriever, and AWS Bedrock (Llama 3) on Lambda behind API Gateway. Built for speed, low cost, and security, it returns concise answers with cited sources, throttled requests, and deterministic builds for predictable deployments in production.",
            technologies: ["AWS Lambda", "API Gateway", "S3", "ETL data transformation", "DynamoDB", "Bedrock (Llama 3)", "JavaScript", "Precompute-RAG", "TF-IDF"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/chatbot.jpg",
            links: {
                live: "#",
                github: "https://github.com/Marubozu-Ousseini/portfolio-chatbot"
            }
        },
        {
            id: 2,
            title: "Portfolio Webpage (with AI Agent Integration)",
            description: "Responsive portfolio website integrated with Sensei, my AI agent. The site renders dynamic sections (projects, certifications, skills) from a single config and embeds a chat widget that connects to a secure AWS backend (API Gateway + Lambda + Bedrock) using an S3-backed RAG store. Built for speed and reliability with lightweight JavaScript, clean CSS, and simple form handling and accessibility.",
            technologies: ["HTML", "CSS", "JavaScript", "AWS API Gateway", "AWS Lambda", "AWS Bedrock", "S3", "RAG (TF-IDF)", "Formspree"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/portfolio.png",
            links: {
                live: "#",
                github: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website"
            }
        },
        {
            id: 3,
            title: "NBA DataLake",
            description: "This repository contains the setup_nba_data_lake.py script, which automates the creation of a data lake for NBA analytics using AWS services. The script integrates Amazon S3, AWS Glue, and Amazon Athena, and sets up the infrastructure needed to store and query NBA-related data.",
            technologies: ["CloudShell Console", "S3 bucket", "Glue database and ETL", "Athena", "Lambda", "QuickSight"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/datalake.png",
            links: {
                live: "#",
                github: "https://github.com/Marubozu-Ousseini/NBADataLake-Day3-DevOpsAllStarsChallenge"
            }
        },
        {
            id: 4,
            title: "Sports API Management System",
            description: "This project demonstrates building a containerized API management system for querying sports data. It leverages Amazon ECS (Fargate) for running containers, Amazon API Gateway for exposing REST endpoints, and an external Sports API for real-time sports data. The project showcases advanced cloud computing practices, including API management, container orchestration, and secure AWS integrations.",
            technologies: ["AWS Amazon ECS (Fargate)", "Amazon ECR", "API Gateway", "CloudWatch", "Python 3.x", "Docker", "IAM Security"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/API%20man.jpg",
            links: {
                live: "#",
                github: "https://github.com/Marubozu-Ousseini/containerized-sports-api"
            }
        },
        {
            id: 5,
            title: "NCAA Game Highlights",
            description: "This project uses RapidAPI to obtain NCAA game highlights using a Docker container and uses AWS Media Convert to convert the media file. Terraform Scripts: These scripts are used to created resources in AWS in a scalable and repeatable way. All of the resources we work with like S3, creating IAM user roles, elastic registry service and elastic container services is built here.",
            technologies: ["CloudShell", "RapidAPI", "S3", "Terraform", "Docker", "ECR", "ECS", "VPC media endpoint"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/NCAA.png",
            links: {
                live: "#",
                github: "https://github.com/Marubozu-Ousseini/NCAA-GameHighlights"
            }
        },
        {
            id: 6,
            title: "From Monolithic App to Microservices",
            description: "Deploy a monolithic Node.js application to a Docker container, then decouple the application into microservices without any downtime. The Node.js application hosts a simple message board with threads and messages between users.",
            technologies: ["AWS CLI", "Copilot", "Docker", "VS Code", "EC2", "ECR", "ECS", "Fargate"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/mono.jpg",
            links: {
                live: "#",
                github: "https://github.com/Marubozu-Ousseini/amazon-ecs-nodejs-microservices.git"
            }
        },
        {
            id: 7,
            title: "NBA statistics pipeline using AWS",
            description: "This project creates an automated data pipeline that collects and stores NBA team statistics using AWS services. It demonstrates core DevOps principles including cloud storage, API integration, automated data collection, and infrastructure as code.",
            technologies: ["- Python 3.x", "AWS DynamoDB", "AWS Lambda", "AWS CloudWatch", "SportsData.io API", "Boto3 (AWS SDK)", "Python JSON Logger"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/Statistique.png",
            links: {
                live: "#",
                github: "https://github.com/Marubozu-Ousseini/nba-stats-pipeline"
            }
        },
        {
            id: 8,
            title: "NBA Game Day Notifications / Sports Alerts System",
            description: "This project is an alert system that sends real-time NBA game day score notifications to subscribed users via SMS/Email. It leverages Amazon SNS, AWS Lambda and Python, Amazon EvenBridge and NBA APIs to provide sports fans with up-to-date game information. The project demonstrates cloud computing principles and efficient notification mechanisms.",
            technologies: ["AWS", "Amazon SNS", "AWS Lambda", "Amazon EventBridge", "Python 3.x", "SportsData.io API", "Boto3 (AWS SDK)", "Twilio (for SMS)", "SMTP (for Email)"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/gameDay.png",
            links: {
                live: "#",
                github: "https://github.com/Marubozu-Ousseini/30-Day-DevOps-Challenge_Day02game-day"
            }
        },
        {
            id: 9,
            title: "Weather Dashboard",
            description: "Fetches real-time weather data for multiple cities, displays temperature (°F), humidity, and weather conditions, automatically stores weather data in AWS S3, supports multiple cities tracking, timestamps all data for historical tracking",
            technologies: ["Python 3.x", "AWS (S3)", "OpenWeather API", "boto3 (AWS SDK)", "python-dotenv"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/weather.png",
            links: {
                live: "#",
                github: "https://github.com/Marubozu-Ousseini/30days-weather-dashboard-Yd--Dla-Gra"
            }
        },
        {
            id: 10,
            title: "Connecting VPCs",
            description: "The city's marketing team wants separate Amazon VPCs for each department that allows communication between Amazon VPCs.",
            technologies: ["VPC", "AWS Console", "AWS Subnet", "VPC Peering"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/vpc.png",
            links: {
                live: "#",
                github: "#"
            }
        },
        {
            id: 11,
            title: "AI-Powered Analytics Platform",
            description: "Developed a machine learning platform that processes real-time data streams to provide predictive analytics for e-commerce businesses. Built using Python, TensorFlow, and AWS SageMaker.",
            technologies: ["Python", "TensorFlow", "AWS SageMaker", "Apache Kafka", "React"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/brain.png",
            links: {
                live: "#",
                github: "#"
            }
        },
        {
            id: 12,
            title: "Multi-Cloud Disaster Recovery",
            description: "Designed and implemented a comprehensive disaster recovery solution spanning AWS, Azure, and Google Cloud Platform, ensuring 99.9% uptime for critical business applications.",
            technologies: ["AWS", "Azure", "GCP", "Terraform", "Ansible"],
            image: "https://github.com/Marubozu-Ousseini/Static-Portfolio-Website/raw/main/images/multicloud.webp",
            links: {
                live: "#",
                github: "#"
            }
        }
    ],

    // Skills Section
    skills: {
        "Cloud Platforms": [
            { name: "Amazon Web Services (AWS)", icon: "fab fa-aws" },
            { name: "Microsoft Azure", icon: "fab fa-microsoft" },
            { name: "Google Cloud", icon: "fab fa-google" },
            { name: "Oracle Cloud", icon: "fab fa-oracle" }
        ],
        "Programming Languages": [
            { name: "Python", icon: "fab fa-python" },
            { name: "JavaScript", icon: "fab fa-js-square" },
            { name: "Java", icon: "fab fa-java" },
            { name: "HTML", icon: "fab fa-html5" },
            { name: "CSS", icon: "fab fa-css3" }
        ],
        "DevOps & Automation": [
            { name: "Docker", icon: "fab fa-docker" },
            { name: "GitHub", icon: "fab fa-github" },
            { name: "Kubernetes", icon: "fas fa-cube" },
            { name: "Terraform", icon: "fas fa-mountain" },
            { name: "Jenkins", icon: "fas fa-tools" }
        ],
        "AI & Machine Learning": [
            { name: "n8n", icon: "fas fa-brain" },
            { name: "AWS SageMaker", icon: "fas fa-robot" },
            { name: "TensorFlow", icon: "fas fa-brain" },
            { name: "PyTorch", icon: "fas fa-brain" },
            { name: "Bedrock", icon: "fas fa-robot" }
        ],
        "Databases": [
            { name: "RDS", icon: "fas fa-database" },
            { name: "Neptune", icon: "fas fa-database" },
            { name: "Redis", icon: "fas fa-memory" },
            { name: "S3", icon: "fas fa-database" },
            { name: "DynamoDB", icon: "fas fa-table" }
        ]
    },
    

    // Contact Form Configuration
    contact: {
        submitUrl: window.getEnv ? window.getEnv('CONTACT_FORM_URL') : "https://formspree.io/f/mblzpwqr",
        email: window.getEnv ? window.getEnv('CONTACT_EMAIL') : "meandyougtn@gmail.com",
        successMessage: "Thank you for your message! I'll get back to you soon.",
        errorMessage: "Sorry, there was an error sending your message. Please try again.",
        
    },

    // Footer Content
    footer: {
        copyright: "© 2025 Ousseini Oumarou. All rights reserved.",
        socialLinks: [
            { platform: "github", url: "https://github.com/Marubozu-Ousseini", icon: "fab fa-github" },
            { platform: "linkedin", url: "https://www.linkedin.com/in/marubozu", icon: "fab fa-linkedin" },
            { platform: "twitter", url: "https://twitter.com/O%27Marubozu%20Sensei", icon: "fab fa-twitter" }
        ]
    },

    // Section Subtitles (for both languages)
    sections: {
        certificationSubtitle: "Explore my professional certifications and achievements",
        projectsSubtitle: "Recent work and featured projects",
        skillsSubtitle: "Technical expertise and competencies",
        contactSubtitle: "Let's discuss your next project",
        
    },

    // SEO and Meta Information
    seo: {
        title: "Cloud & AI Consultant - Professional Portfolio",
        description: "Experienced Cloud and AI consultant specializing in AWS, Azure, machine learning, and DevOps. Helping businesses transform with cutting-edge technology solutions.",
        keywords: "cloud consultant, AI consultant, AWS certified, machine learning, cloud architecture",
        author: "Ousseini Oumarou"
    }
};

// Optional chatbot configuration used by the chat widget.
// You can edit this list to customize the FAQs that appear when clicking the FAQ button in the widget header.
window.siteContent.chatbot = window.siteContent.chatbot || {};
window.siteContent.chatbot.faqs = window.siteContent.chatbot.faqs || [
    'What are your key projects?',
    'What AI/Machine Learning projects have you worked on?',
    'What certifications do you have?',
    'What are your core skills?',
    'Tell me about yourself',
    'How can I contact you?'
];

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = siteContent;
}