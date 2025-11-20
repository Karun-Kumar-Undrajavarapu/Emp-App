pipeline {
    agent any

    tools {
        nodejs 'NodeJS' 
    }

    environment {
        APP_VM_IP = '172.31.9.55' 
        DEPLOY_DIR = '/var/www/employee-app'
        NODE_ENV = 'production'
	MONGO_URI="mongodb://172.31.9.55:27017/employee_a"

    }

    stages {
        stage('Checkout') {
            steps {
                echo 'Pulling code from GitHub...'
                git branch: 'main', 
                    credentialsId: 'github-creds', 
                    url: 'https://github.com/Karun-Kumar-Undrajavarapu/Emp-App'
            }
        }

        stage('Install Dependencies') {
            steps {
                echo 'Installing production dependencies...'
                sh 'npm ci --only=production'
            }
            post {
                always {
                    // Cache node_modules for faster future runs
                    stash includes: 'node_modules/**', name: 'node_modules_cache'
                }
            }
        }

        stage('Lint & Validate') {
            steps {
                echo 'Linting code...'
                echo "Skipping lint - no lint script configured"
                
                script {
                    // Smoke test: Temp start server, check MongoDB connect + API health
                    sh '''
                        # Start server in background
                        nohup node server.js > smoke.log 2>&1 &
                        SERVER_PID=$!
                        sleep 10  # Wait for MongoDB connect (logs "MongoDB connected")
                        
                        # Check logs for DB success
                        if ! grep -q "MongoDB connected" smoke.log; then
                            echo "MongoDB connection failed—check MONGO_URI!"
                            exit 1
                        fi
                        
                        # Health check API (expect 401 without token—confirms server up)
                        if ! curl -f -s -o /dev/null -w "%{http_code}" http://localhost:83/api/employees | grep -q "^401$"; then
                            echo "API health check failed!"
                            exit 1
                        fi
                        
                        kill $SERVER_PID
                        rm smoke.log
                        echo "Smoke test passed: Server + MongoDB healthy"
                    '''
                }
            }
        }

        stage('Test') {
            steps {
                echo 'Running unit/integration tests...'
                sh 'npm test'  
            }
            post {
                always {
                    junit '**/test-results.xml' 
                    archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true  
                }
            }
        }

        stage('Deploy') {
            when { branch 'main' }
            steps {
                echo 'Deploying to app VM...'
                sshagent(['ssh-to-app']) {
                    sh """
                        # Rsync code (exclude secrets, logs, etc.)
                        rsync -avz --delete --exclude='.env' --exclude='node_modules' --exclude='*.log' --exclude='backup/' $WORKSPACE/ ubuntu@$APP_VM_IP:$DEPLOY_DIR/
                        
                        # Deploy via SSH: Clean install, restart, verify
                        ssh ubuntu@$APP_VM_IP "
                            cd $DEPLOY_DIR
                            
                            # Ensure .env exists (pre-set on VM; or echo secrets from Jenkins creds if needed)
                            if [ ! -f .env ]; then
                                echo 'Warning: .env missing—copy manually!'
                            fi
                            
                            # Clean and reinstall deps
                            rm -rf node_modules package-lock.json
                            npm ci --only=production
                            
                            # Stop old server
                            pkill -f 'node server.js' || true
                            sleep 2
                            
                            # Start new server
                            nohup node server.js > app.log 2>&1 &
                            sleep 5
                            
                            # Verify: Check logs for DB connect + API
                            if ! grep -q 'MongoDB connected' app.log; then
                                echo 'MongoDB failed post-deploy—check MONGO_URI!'
                                exit 1
                            fi
                            if ! curl -f -s -o /dev/null http://localhost:83/api/employees; then
                                echo 'Post-deploy health check failed!'
                                exit 1
                            fi
                            echo 'Deploy successful—server running on :83'
                        "
                        
                        # Reload Nginx (proxies to localhost:83)
                        ssh ubuntu@$APP_VM_IP 'sudo nginx -t && sudo systemctl reload nginx'
                    """
                }
            }
        }
    }

    post {
        always {
            echo 'Pipeline complete! App accessible via Nginx at http://app-vm-ip:80'
            cleanWs()
        }
        success {
            echo 'Deployment succeeded—test CRUD at /employees.html'
        }
        failure {
            echo 'Pipeline failed—review logs and fix'
            // Optional: mail to: 'your@email.com', subject: 'Deploy Failed'
        }
    }
}
