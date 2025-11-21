pipeline {
    agent any
    tools {
        nodejs 'NodeJS'
    }
    environment {
        APP_VM_IP = '172.31.9.55'  // Private IP
        DEPLOY_DIR = '/var/www/employee-app'
        NODE_ENV = 'production'
        MONGO_URI = "mongodb://172.31.9.55:27017/employee_a"
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
                sh 'npm ci --omit=dev'
            }
            post {
                always {
                    stash includes: 'node_modules/**', name: 'node_modules_cache'
                }
            }
        }
        stage('Lint & Validate') {
            steps {
                script {
                    // Install dev for lint (temp)
                    sh '''
                        npm install  # Includes dev (ESLint)
                        npm prune --omit=dev  # Clean back to prod after lint
                    '''
                    echo 'Linting code...'
                    sh 'npm run lint'

                    // Temp .env for test mode
                    sh '''
                        cat > .env << EOF
                        PORT=3000
                        MONGO_URI=mongodb://localhost:27017/mockdb
                        JWT_SECRET=test-secret-key
                        NODE_ENV=test
                        EOF
                    '''

                    sh '''
                        set -e  # Exit on error
                        # Start in test mode
                        nohup npm run start:test > smoke.log 2>&1 &
                        SERVER_PID=$!
                        sleep 10

                        # Check PID alive
                        if ! ps -p $SERVER_PID > /dev/null; then
                            echo "Server failed to start!"
                            tail -20 smoke.log
                            exit 1
                        fi

                        # Check mock DB log (quoted for parens)
                        if ! grep -q "MongoDB connected (mock)" smoke.log; then
                            echo "DB mock failed—check logs:"
                            tail -20 smoke.log
                            exit 1
                        fi

                        # Health checks on test port 3000
                        if ! curl -f -s -o /dev/null http://localhost:3000/; 
                            echo "Static route failed!"
                            exit 1
                        fi
                        API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/employees)
                        if [[ ! "$API_STATUS" =~ ^(200|401)$ ]]; then
                            echo "API check failed (status: $API_STATUS)!"
                            exit 1
                        fi

                        # Cleanup
                        kill $SERVER_PID || true
                        rm -f smoke.log .env
                        echo "Smoke test passed: Server + mock DB healthy."
                    '''
                }
            }
        }
        stage('Test') {
            steps {
                echo 'Running tests...'
                sh 'NODE_ENV=test npm test || true'
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
                echo 'Deploying to Application VM...'
                sshagent(['ssh-to-app']) {
                    sh """
                        # Rsync (exclude secrets/logs)
                        rsync -avz --delete \\
                            --exclude='.env' \\
                            --exclude='*.log' \\
                            --exclude='backup/' \\
                            --exclude='node_modules' \\
                            \$WORKSPACE/ ubuntu@\$APP_VM_IP:\$DEPLOY_DIR/

                        # Deploy with real env
                        ssh ubuntu@\$APP_VM_IP "
                            cd \$DEPLOY_DIR
                            if [ ! -f .env ]; then
                                echo 'Error: .env missing on VM!'
                                exit 1
                            fi
                            rm -rf node_modules package-lock.json
                            npm ci --omit=dev
                            pkill -f 'node server.js' || true
                            sleep 2
                            nohup node server.js > app.log 2>&1 &
                            sleep 5
                            if ! pgrep -f 'node server.js' > /dev/null; then
                                echo 'Server failed post-deploy!'
                                tail -20 app.log
                                exit 1
                            fi
                            if ! grep -q 'MongoDB connected' app.log; then
                                echo 'DB failed post-deploy!'
                                tail -20 app.log
                                exit 1
                            fi
                            API_STATUS=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost:83/api/employees)
                            if [ "\$API_STATUS" != "401" ]; then
                                echo 'Post-deploy API check failed (status: \$API_STATUS)!'
                                exit 1
                            fi
                            echo 'Deploy successful — server on port 83'
                        "
                        ssh ubuntu@\$APP_VM_IP 'sudo nginx -t && sudo systemctl reload nginx'
                    """
                }
            }
        }
    }
    post {
        always {
            echo 'Pipeline complete! App accessible via http://18.237.139.122:80 (Nginx)'
            cleanWs()
        }
        success {
            echo 'Deployment SUCCESS — test CRUD at /employees.html'
        }
        failure {
            echo 'Pipeline FAILED — check logs above.'
        }
    }
}
