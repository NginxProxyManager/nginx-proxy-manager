pipeline {
  options {
    buildDiscarder(logRotator(numToKeepStr: '10'))
    disableConcurrentBuilds()
  }
  agent any
  stages {
    stage('Build Develop') {
      when {
        branch 'develop'
      }
      steps {
        sh 'figlet "develop"'
      }
    }
    stage('Build Always') {
      sh 'figlet "$BRANCH_NAME"'
      sh 'env'
    }
  }
  post {
    success {
      juxtapose event: 'success'
      sh 'figlet "SUCCESS"'
    }
    failure {
      juxtapose event: 'failure'
      sh 'figlet "FAILURE"'
    }
  }
}

